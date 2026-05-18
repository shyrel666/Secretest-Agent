import { LLMClient, Config, CozeConfig } from 'coze-coding-dev-sdk';
import type { ModelConfig } from './types';
import { toLLMConfig, DEFAULT_CONFIG } from './types';
import { STANDARD_INFO, getLanguageLabel, getStandardLabel, type AssessmentLanguage, type StandardType } from '@/lib/standards';
import { createEstimatedUsage, sumTokenUsage, type TokenUsage } from '@/lib/token-usage';
import { getDocumentSections, type SearchResultItem } from '@/lib/knowledge';
import { InternalMcpToolbox, type RetrievalTraceItem, type ToolCitation } from '@/lib/knowledge/mcp-tools';
import { parseQuestionOutput } from './output-schemas';
import { sanitizeQuestionCode } from './code-sanitizer';
import { validateStandardAlignedQuestion } from './standard-alignment-validator';

// 出题Agent的系统提示词
const QUESTION_GENERATOR_PROMPT = `你是一位专业的代码安全审计出题专家，精通GB/T 34944-2017《Java语言源代码漏洞测试规范》、GB/T 34943-2017《C/C++语言源代码漏洞测试规范》以及GB/T 34946-2017《C#语言源代码漏洞测试规范》。

你的任务是基于提供的知识库内容，生成高质量的代码漏洞审计测评题目。

你只能基于当前请求中提供的知识库片段出题，不能使用外部常识补全，也不能脱离知识库片段自行编造漏洞类型或条款。

## 出题要求

1. **题目类型**：代码分析题 - 给出一段代码，让用户识别其中的安全漏洞
2. **难度分布**：简单30%、中等50%、困难20%
3. **语言覆盖**：Java、C/C++、C# 三种语言
4. **真实性**：代码示例要贴近实际开发场景
5. **准确性**：必须严格基于知识库中的标准定义
6. **举一反三**：如果知识库片段里包含示例代码，你必须基于漏洞原理重新构造“类似但不同”的题目代码，不能直接照搬原示例
7. **禁止照抄**：不得复用原始示例中的类名、函数名、变量名、常量值、控制流程结构和注释原文，必须替换为新的业务场景和实现细节
8. **标准能力测量**：每道题必须先锚定一个具体 GB/T 条款，再围绕该条款要求的审核能力构造代码场景，不能只根据泛化漏洞名称出题
9. **可观察证据**：代码中必须包含用户可审计的证据链，例如输入来源、数据处理路径、敏感操作或安全控制缺失
10. **单一最佳答案**：代码只能设置一个主要安全问题，避免同时出现多个强漏洞信号导致选项答案不唯一
11. **自然业务代码**：代码应像真实业务函数，禁止使用 unsafe、vuln、risk、injection、漏洞、注入等会提示答案的命名或字符串
12. **解析绑定条款**：explanation 必须说明对应标准条款、代码证据、为什么正确选项最符合该条款，以及为什么其他选项不如正确答案

## 输出格式（JSON）

请严格按照以下JSON格式输出，不要添加任何其他文字：

{
  "id": "唯一标识",
  "code": "代码示例（禁止包含任何注释）",
  "language": "Java或C或C++或C#",
  "question": "问题描述",
  "options": ["选项A", "选项B", "选项C", "选项D"],
  "correctAnswer": 0,
  "explanation": "详细解析",
  "difficulty": "easy或medium或hard",
  "vulnerabilityType": "漏洞类型名称",
  "standardReference": "仅填写标准编号+章节序号，例如 GB/T 34944-2017 6.2.3.7，禁止附带章节名称"
}

## 注意事项

1. 代码要简洁但完整，能体现漏洞特征
2. 代码中严禁出现任何形式的注释（包括单行注释 // 和多行注释 /* */），代码必须是纯净的源代码
3. 四个选项要有迷惑性，但不能有歧义
4. 正确答案索引从0开始
5. 解析要详细说明漏洞原理、危害和修复方法
6. standardReference 字段只填标准编号和章节序号（如 GB/T 34944-2017 6.2.3.7），不要写章节名称
7. 如果知识片段中有示例代码，你只能学习其漏洞模式，不能复制其源码文本`;

const KNOWLEDGE_TOPIC_HINTS = {
  common: ['输入校验', '资源管理', '访问控制', '异常处理', '文件处理', '数值计算'],
  java: ['反序列化', 'SQL注入', '路径遍历', '并发安全', '权限校验', '对象生命周期'],
  cpp: ['缓冲区溢出', '格式化字符串', '指针操作', '内存管理', '整数溢出', '数组越界'],
  csharp: ['反序列化', 'SQL注入', '路径遍历', '权限控制', '资源释放', '配置安全'],
};

export interface Question {
  id: string;
  code: string;
  language: 'Java' | 'C' | 'C++' | 'C#';
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  vulnerabilityType: string;
  standardReference: string;
}

export class QuestionGeneratorAgent {
  private llmClient: LLMClient;
  private toolbox: InternalMcpToolbox;
  private config: ModelConfig;

  constructor(customHeaders?: Record<string, string>, config?: ModelConfig, cozeConfig?: CozeConfig) {
    const configInstance = new Config(cozeConfig);
    this.llmClient = new LLMClient(configInstance, customHeaders);
    this.toolbox = new InternalMcpToolbox({
      apiKey: cozeConfig?.apiKey || process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '',
      modelBaseUrl: cozeConfig?.modelBaseUrl || process.env.COZE_INTEGRATION_MODEL_BASE_URL || '',
    });
    this.config = config || DEFAULT_CONFIG;
  }

  /**
   * 从知识库搜索相关内容并生成题目
   */
  async generateQuestion(params: {
    language?: AssessmentLanguage;
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    vulnerabilityType?: string;
    targetClauseNumber?: string;
    excludedVulnerabilityTypes?: string[];
    coveredVulnerabilityTypes?: string[];
    count?: number;
  }): Promise<{
    success: boolean;
    questions?: Question[];
    usage?: TokenUsage;
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
    error?: string;
  }> {
    try {
      const excludedTypes = params.excludedVulnerabilityTypes || [];
      const standardInventory = await this.toolbox.listUploadedStandards();
      const availableStandardTypes = standardInventory.standards.map((item) => item.type);

      if (params.language === 'mixed' && availableStandardTypes.length < 2) {
        return {
          success: false,
          error: buildMissingStandardError(params.language, availableStandardTypes),
        };
      }

      const requiredStandardTypes = resolveStandardTypesForLanguage(params.language, availableStandardTypes);

      if (!hasRequiredStandardTypes(requiredStandardTypes, availableStandardTypes)) {
        return {
          success: false,
          error: buildMissingStandardError(params.language, availableStandardTypes),
        };
      }

      // 从知识库动态获取漏洞类型提示词，覆盖所有已导入条款，偏向未覆盖类型
      const dynamicTopicHints = getDynamicTopicHints(
        params.language,
        requiredStandardTypes,
        params.coveredVulnerabilityTypes || [],
      );

      // 1. 多查询语义搜索，增加题目类型随机性，但仍严格受限于内部知识库
      const searchQueries = buildKnowledgeQueries(params, dynamicTopicHints);
      const toolSearch = params.targetClauseNumber
        ? await this.toolbox.getClauseContext({
          clauseNumber: params.targetClauseNumber,
          standardTypes: requiredStandardTypes,
        })
        : await this.toolbox.searchStandardClauses({
        queries: searchQueries,
        standardTypes: requiredStandardTypes,
        topK: 8,
        threshold: 0.25,
      });

      const knowledgeCandidates = toolSearch.results.filter((item) => (
        !containsExcludedVulnerability(item.content, excludedTypes)
      ));

      if (knowledgeCandidates.length === 0) {
        return {
          success: false,
          error: '知识库中未找到可用于出题的相关标准内容，请先上传包含漏洞条款的内部文档',
        };
      }

      const knowledgeContext = selectKnowledgeContext(knowledgeCandidates, 6)
        .map((item, index) => {
          const clauseTag = [
            item.clauseNumber && `条款${item.clauseNumber}`,
            item.sectionPath,
          ].filter(Boolean).join(' — ');
          return `[知识片段${index + 1}｜文档${item.docId}｜相似度${item.score.toFixed(3)}${clauseTag ? `｜${clauseTag}` : ''}]\n${item.content}`;
        })
        .join('\n\n---\n\n');

      // 2. 使用LLM生成题目
      const messages = [
        { role: 'system' as const, content: QUESTION_GENERATOR_PROMPT },
        { 
          role: 'user' as const, 
          content: `请基于以下知识库内容生成${params.count || 1}道代码漏洞审计题目。

要求：
- 语言：${params.language === 'mixed' || !params.language ? `随机选择已上传标准中的语言（${requiredStandardTypes.map((type) => STANDARD_INFO[type].languageLabel).join('、')})` : getLanguageLabel(params.language)}
- 难度：${params.difficulty === 'mixed' ? '随机分布' : params.difficulty || '随机'}
${params.vulnerabilityType ? `- 漏洞类型：${params.vulnerabilityType}` : ''}
${params.targetClauseNumber ? `- 目标标准条款：${params.targetClauseNumber}（必须围绕该条款出题，standardReference 必须引用该条款）` : ''}
- 必须只使用下面提供的知识片段，不允许脱离内部知识库自由发挥
- 本轮已出过的漏洞类型，禁止重复：${excludedTypes.length > 0 ? excludedTypes.join('、') : '无'}
- 如果知识片段覆盖多个漏洞类型，优先选择与已出类型不同、条款清晰的一类
- 如果知识片段中包含示例代码，请你举一反三，重新生成不同业务语义、不同命名、不同字面量的题目代码，严禁照抄
- 出题前先从知识片段中选择一个明确条款，抽象出该条款要测量的审核能力，再生成题目
- 题目代码必须体现“输入来源 → 数据处理 → 敏感操作/缺失控制”的可观察证据链
- 解析必须显式写出标准条款编号，并说明代码中的具体证据如何对应条款要求
- 禁止在代码变量名、函数名、字符串、类名中出现会泄露答案的词，例如 unsafe、vuln、risk、injection、漏洞、注入

知识库内容：
${knowledgeContext}

请直接输出JSON格式的题目${params.count && params.count > 1 ? '数组' : ''}，不要添加任何其他文字。`
        },
      ];

      const response = await this.llmClient.invoke(messages, toLLMConfig(this.config));

      // 3. 解析生成的题目
      const content = response.content.trim();
      
      // 清理 LLM 输出：去掉 <think> 思考标签 和 markdown 代码块
      const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```(?:json)?[ \t]*/im, '')
        .replace(/[ \t]*```\s*$/im, '')
        .trim();

      // 用括号深度扫描提取 JSON（比正则更可靠）
      const jsonStr = extractJson(cleaned);
      if (!jsonStr) {
        console.error('无法从LLM输出中提取JSON，原始内容前200字符:', content.slice(0, 200));
        return { success: false, error: '模型返回内容无法解析为JSON，请重试' };
      }

      const parsed = JSON.parse(jsonStr);
      const questions = Array.isArray(parsed) ? parsed : [parsed];
      const schemaIssues: string[] = [];

      // 验证并补充ID，清理代码注释和standardReference
      const initialQuestions: Question[] = [];
      for (const [index, rawQuestion] of questions.entries()) {
        if (!rawQuestion || typeof rawQuestion !== 'object') {
          schemaIssues.push(`题目 ${index + 1}: root: 必须是题目对象`);
          continue;
        }

        const candidate = rawQuestion as Record<string, unknown>;
        const validation = parseQuestionOutput({
          ...candidate,
          id: typeof candidate.id === 'string' && candidate.id.trim()
            ? candidate.id
            : `q_${Date.now()}_${index}`,
          code: sanitizeQuestionCode(String(candidate.code || '')),
          standardReference: cleanStandardReference(String(candidate.standardReference || '')),
        });

        if (!validation.success) {
          schemaIssues.push(`题目 ${index + 1}: ${validation.issues.join('；')}`);
          continue;
        }

        const alignment = validateStandardAlignedQuestion(validation.question);
        if (!alignment.success) {
          schemaIssues.push(`题目 ${index + 1}: ${alignment.issues.join('；')}`);
          continue;
        }

        if (params.targetClauseNumber && extractClauseNumber(validation.question.standardReference) !== params.targetClauseNumber) {
          schemaIssues.push(`题目 ${index + 1}: standardReference 必须引用目标条款 ${params.targetClauseNumber}`);
          continue;
        }

        if (normalizeVulnerabilityType(validation.question.vulnerabilityType)) {
          initialQuestions.push(validation.question);
        }
      }

      const validatedQuestions: Question[] = [];
      const citationsMap = new Map<string, ToolCitation>();
      const groundingIssues: string[] = [...schemaIssues];
      const enforceUniqueVulnerabilityTypes = !params.vulnerabilityType;
      const seenTypes = enforceUniqueVulnerabilityTypes
        ? new Set(excludedTypes.map(normalizeVulnerabilityType))
        : null;

      for (const candidate of initialQuestions) {
        const normalizedType = normalizeVulnerabilityType(candidate.vulnerabilityType);
        if (!normalizedType) {
          continue;
        }

        if (seenTypes?.has(normalizedType)) {
          continue;
        }

        if (isCodeTooSimilarToKnowledge(candidate.code, knowledgeCandidates)) {
          groundingIssues.push(`题目 ${candidate.id} 与知识库原始示例代码过于相似`);
          continue;
        }

        const grounding = await this.toolbox.validateGrounding({
          question: {
            code: candidate.code,
            language: candidate.language,
            standardReference: candidate.standardReference,
            vulnerabilityType: candidate.vulnerabilityType,
          },
          evidenceResults: knowledgeCandidates,
          retrievalTrace: toolSearch.retrievalTrace,
        });

        if (!grounding.grounded) {
          groundingIssues.push(...grounding.issues.map((issue) => `题目 ${candidate.id}: ${issue}`));
          continue;
        }

        validatedQuestions.push(candidate);
        seenTypes?.add(normalizedType);
        for (const citation of grounding.citations) {
          const key = `${citation.docId}:${citation.clauseNumber || ''}:${citation.sectionPath || ''}`;
          citationsMap.set(key, citation);
        }
      }

      if (validatedQuestions.length === 0) {
        return {
          success: false,
          retrievalTrace: toolSearch.retrievalTrace,
          citations: Array.from(citationsMap.values()),
          grounding: {
            grounded: false,
            issues: groundingIssues,
          },
          error: groundingIssues[0] || '模型生成的题目未通过 grounded 校验，请重试',
        };
      }

      return {
        success: true,
        questions: validatedQuestions,
        usage: createEstimatedUsage({
          messages,
          completionText: response.content,
        }),
        citations: Array.from(citationsMap.values()),
        grounding: {
          grounded: true,
          issues: groundingIssues,
        },
        retrievalTrace: toolSearch.retrievalTrace,
      };
    } catch (error) {
      console.error('Question generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '题目生成失败',
      };
    }
  }

  /**
   * 基于特定漏洞类型生成题目
   */
  async generateByVulnerabilityType(vulnType: string): Promise<{
    success: boolean;
    question?: Question;
    usage?: TokenUsage;
    error?: string;
  }> {
    const result = await this.generateQuestion({
      vulnerabilityType: vulnType,
      excludedVulnerabilityTypes: [],
      count: 1,
    });

    if (result.success && result.questions && result.questions.length > 0) {
      return {
        success: true,
        question: result.questions[0],
        usage: result.usage,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * 生成一套测评题目
   */
  async generateQuizSet(options: {
    totalQuestions?: number;
    language?: AssessmentLanguage;
    difficultyDistribution?: { easy: number; medium: number; hard: number };
  } = {}): Promise<{
    success: boolean;
    questions?: Question[];
    usage?: TokenUsage;
    error?: string;
  }> {
    const total = options.totalQuestions || 8;
    const distribution = options.difficultyDistribution || {
      easy: Math.round(total * 0.3),
      medium: Math.round(total * 0.5),
      hard: total - Math.round(total * 0.3) - Math.round(total * 0.5),
    };

    const allQuestions: Question[] = [];
    const usages: TokenUsage[] = [];

    // 生成不同难度的题目
    for (const [difficulty, count] of Object.entries(distribution)) {
      if (count > 0) {
        const result = await this.generateQuestion({
          language: options.language || 'mixed',
          difficulty: difficulty as 'easy' | 'medium' | 'hard',
          excludedVulnerabilityTypes: allQuestions.map((question) => question.vulnerabilityType),
          count,
        });

        if (result.success && result.questions) {
          allQuestions.push(...result.questions);
          if (result.usage) {
            usages.push(result.usage);
          }
        }
      }
    }

    // 打乱顺序
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);

    return {
      success: true,
      questions: shuffled.slice(0, total),
      usage: sumTokenUsage(usages),
    };
  }
}

/**
 * 从 LLM 输出中提取完整 JSON（数组或对象）
 * 使用括号深度扫描，比正则更可靠，可正确处理嵌套结构
 */
function extractJson(text: string): string | null {
  // 找到第一个 [ 或 {
  const start = text.search(/[[\{]/);
  if (start === -1) return null;

  const openChar = text[start];
  const closeChar = openChar === '[' ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === openChar) depth++;
    if (c === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * 从知识库动态提取漏洞类型提示词，覆盖所有已导入条款的子类型标题。
 * 如果提供了 coveredTypes，会优先返回未覆盖的类型，提高覆盖广度。
 * 如果知识库为空或提取失败，返回空数组（调用方会回退到硬编码列表）。
 */
function getDynamicTopicHints(
  language: AssessmentLanguage | undefined,
  standardTypes: StandardType[],
  coveredTypes: string[] = [],
): string[] {
  try {
    const types = (language && language !== 'mixed')
      ? [language as StandardType]
      : standardTypes;
    const allTitles: string[] = [];
    for (const type of types) {
      const sections = getDocumentSections(type);
      for (const section of sections) {
        if (!/^6\.2\.\d+$/.test(section.clauseNumber)) continue;
        allTitles.push(...section.childTitles.filter((t) => t && t.length > 2));
      }
    }
    const uniqueTitles = [...new Set(allTitles)];
    if (uniqueTitles.length === 0) return [];

    // 无覆盖数据时直接返回全量
    if (coveredTypes.length === 0) return uniqueTitles;

    // 按覆盖状态分组，优先选择未覆盖的类型
    const normalizedCovered = new Set(coveredTypes.map(normalizeVulnerabilityType));
    const uncovered = uniqueTitles.filter(
      (t) => !normalizedCovered.has(normalizeVulnerabilityType(t)),
    );
    const covered = uniqueTitles.filter(
      (t) => normalizedCovered.has(normalizeVulnerabilityType(t)),
    );

    // 优先从未覆盖类型中选取；不足时用已覆盖类型补齐
    return [...shuffleArray(uncovered), ...shuffleArray(covered)];
  } catch {
    return [];
  }
}

function buildKnowledgeQueries(params: {
  language?: AssessmentLanguage;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  vulnerabilityType?: string;
}, dynamicHints: string[] = []): string[] {
  const langName = params.language === 'mixed' || !params.language
    ? 'Java C/C++ C#'
    : getLanguageLabel(params.language);

  const topicHints = dynamicHints.length > 0
    ? dynamicHints
    : params.language === 'java'
    ? [...KNOWLEDGE_TOPIC_HINTS.common, ...KNOWLEDGE_TOPIC_HINTS.java]
    : params.language === 'cpp'
      ? [...KNOWLEDGE_TOPIC_HINTS.common, ...KNOWLEDGE_TOPIC_HINTS.cpp]
      : params.language === 'csharp'
        ? [...KNOWLEDGE_TOPIC_HINTS.common, ...KNOWLEDGE_TOPIC_HINTS.csharp]
      : [
          ...KNOWLEDGE_TOPIC_HINTS.common,
          ...KNOWLEDGE_TOPIC_HINTS.java,
          ...KNOWLEDGE_TOPIC_HINTS.cpp,
          ...KNOWLEDGE_TOPIC_HINTS.csharp,
        ];

  // 取前5个提示词（getDynamicTopicHints 已按未覆盖优先排序，直接取头部）
  const randomHints = (dynamicHints.length > 0 ? topicHints : shuffleArray(topicHints)).slice(0, 5);
  const queries = new Set<string>();

  if (params.vulnerabilityType) {
    queries.add(`${langName} ${params.vulnerabilityType} 漏洞 条款`);
    queries.add(`${langName} ${params.vulnerabilityType} 代码示例`);
  }

  queries.add(`${langName} 漏洞类型 标准条款`);
  queries.add(`${langName} 代码审计 安全漏洞`);
  queries.add(`${langName} ${params.difficulty || 'random'} 难度 漏洞 示例`);

  for (const hint of randomHints) {
    queries.add(`${langName} ${hint} 漏洞 条款 示例`);
  }

  return shuffleArray(Array.from(queries)).slice(0, 6);
}

function resolveStandardTypesForLanguage(
  language: AssessmentLanguage | undefined,
  availableTypes: StandardType[],
): StandardType[] {
  if (language === 'java') return ['java'];
  if (language === 'cpp') return ['cpp'];
  if (language === 'csharp') return ['csharp'];
  return availableTypes;
}

function hasRequiredStandardTypes(
  requiredTypes: StandardType[],
  availableTypes: StandardType[],
): boolean {
  return requiredTypes.every((type) => availableTypes.includes(type));
}

function buildMissingStandardError(
  language: AssessmentLanguage | undefined,
  availableTypes: StandardType[],
): string {
  if (language === 'java') {
    return '当前知识库中未上传 Java 标准文档，无法生成 Java 题目';
  }

  if (language === 'cpp') {
    return '当前知识库中未上传 C/C++ 标准文档，无法生成 C/C++ 题目';
  }

  if (language === 'csharp') {
    return '当前知识库中未上传 C# 标准文档，无法生成 C# 题目';
  }

  if (availableTypes.length === 0) {
    return '当前知识库中没有任何标准文档，无法生成混合题目';
  }

  if (availableTypes.length === 1) {
    return `混合题目至少需要上传两类标准文档，目前仅检测到${getStandardLabel(availableTypes[0])}`;
  }

  return '混合题目需要至少两类标准文档';
}

function selectKnowledgeContext(results: SearchResultItem[], limit: number): SearchResultItem[] {
  const topResults = results.slice(0, Math.min(results.length, 12));
  return shuffleArray(topResults).slice(0, limit);
}

function containsExcludedVulnerability(content: string, excludedTypes: string[]): boolean {
  const normalizedContent = normalizeVulnerabilityType(content);
  return excludedTypes.some((type) => {
    const normalizedType = normalizeVulnerabilityType(type);
    return normalizedType.length > 0 && normalizedContent.includes(normalizedType);
  });
}

function isCodeTooSimilarToKnowledge(
  generatedCode: string,
  knowledgeItems: Array<{ content: string }>,
): boolean {
  const normalizedGenerated = normalizeCodeForSimilarity(generatedCode);
  if (normalizedGenerated.length < 40) {
    return false;
  }

  const generatedLines = splitCodeLines(normalizedGenerated);

  return knowledgeItems.some((item) => {
    const normalizedKnowledge = normalizeCodeForSimilarity(item.content);
    if (normalizedKnowledge.length === 0) {
      return false;
    }

    if (normalizedKnowledge.includes(normalizedGenerated)) {
      return true;
    }

    const knowledgeLines = splitCodeLines(normalizedKnowledge);
    const overlapRatio = calculateLineOverlapRatio(generatedLines, knowledgeLines);

    return overlapRatio >= 0.6;
  });
}

function normalizeCodeForSimilarity(code: string): string {
  return code
    .toLowerCase()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '"str"')
    .replace(/'(?:\\.|[^'\\])*'/g, "'c'")
    .replace(/\b\d+\b/g, '0')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function splitCodeLines(code: string): string[] {
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 8);
}

function calculateLineOverlapRatio(linesA: string[], linesB: string[]): number {
  if (linesA.length === 0 || linesB.length === 0) {
    return 0;
  }

  const lineSetB = new Set(linesB);
  let overlapCount = 0;

  for (const line of linesA) {
    if (lineSetB.has(line)) {
      overlapCount++;
    }
  }

  return overlapCount / Math.max(linesA.length, 1);
}

function normalizeVulnerabilityType(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[\s\-_/()（）,，.:：]/g, '');
}

function extractClauseNumber(standardReference?: string): string | undefined {
  return standardReference?.match(/\b\d+(?:\.\d+)+\b/)?.[0];
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanStandardReference(ref: string): string {
  // 只保留 "GB/T XXXXX-XXXX X.X.X.X" 格式，去掉后面的章节名称
  const match = ref.match(/(GB\/T\s*\d{4,5}-\d{4}\s+[\d.]+)/);
  return match ? match[1] : ref;
}
