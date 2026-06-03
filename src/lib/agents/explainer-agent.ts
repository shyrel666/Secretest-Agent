import { LLMClient, Config, CozeConfig } from 'coze-coding-dev-sdk';
import type { Question } from './question-generator-agent';
import type { ModelConfig } from './types';
import { toLLMConfig, DEFAULT_CONFIG } from './types';
import type { LearningTopicLanguage } from '@/lib/learning/topics';
import {
  cloneLessonDocument,
  type LessonDocument,
  type LessonPracticeQuestion,
} from '@/lib/learning/lesson-document';
import { getLanguageLabel } from '@/lib/standards';
import { createEstimatedUsage, type TokenUsage } from '@/lib/token-usage';
import type { SearchResultItem } from '@/lib/knowledge';
import { InternalMcpToolbox, type RetrievalTraceItem, type ToolCitation } from '@/lib/knowledge/mcp-tools';
import {
  buildLessonQualityWarnings,
  logLessonParseDiagnostics,
  normalizeLearningLessonPayload,
  parseNormalizedLearningLessonDocument,
} from '@/lib/learning/lesson-document-parse';

// 讲解Agent的系统提示词
const EXPLAINER_PROMPT = `你是一位耐心细致的代码安全审计导师，擅长用通俗易懂的方式讲解漏洞原理和防护方法。

你的任务是帮助学习者理解：
1. 为什么这段代码存在漏洞
2. 漏洞的形成原理是什么
3. 攻击者如何利用这个漏洞
4. 如何正确修复这个漏洞
5. 相关的安全编码最佳实践

## 讲解风格

1. **循序渐进**：从基础概念开始，逐步深入
2. **图文并茂**：用比喻和类比帮助理解
3. **实战导向**：展示真实的攻击场景
4. **正反对比**：展示问题代码和安全代码的区别
5. **延伸学习**：推荐相关的学习资源

## 输出格式

使用清晰的Markdown格式，包含：
- 漏洞原理（带图示说明）
- 攻击演示（假设攻击场景）
- 修复方案（完整代码示例）
- 最佳实践（编码建议）
- 延伸阅读（相关漏洞类型）`;

const LEARNING_LESSON_PROMPT = `你是一位面向零基础学习者的代码漏洞审计导师。

## 你的任务

1. 严格基于当前提供的内部知识库片段，生成一份"新手闯关课"章节导学
2. 用大白话讲清楚概念，不假设用户已经懂安全术语
3. 把国标条款里的抽象要求翻译成具体的审计观察点
4. 如果知识片段中包含原始示例代码，你只能提炼原理并重构成自己的说明，不能直接照搬大段原文或原始示例

## 输出格式（严格遵守）

只输出一个 JSON 对象，不要输出任何额外说明、前后缀、Markdown 代码块包裹或注释。

JSON 结构：
{
  "contentMarkdown": "（见下方格式要求）",
  "practiceQuestions": [
    { "questionMarkdown": "题面", "answerMarkdown": "参考答案" },
    { "questionMarkdown": "题面", "answerMarkdown": "参考答案" },
    { "questionMarkdown": "题面", "answerMarkdown": "参考答案" }
  ]
}

### contentMarkdown 格式要求

contentMarkdown 必须且只能包含以下 5 个小节。标题格式为「纯数字 + 英文句号 + 空格 + 标题文字」，标题行前后不要加 #、##、### 等任何 Markdown 标题标记。

示例结构（标题文字必须与下面完全一致，不要改写或添加标点）：

1. 本章你会学到什么
（正文内容）

2. 先建立直觉
（正文内容）

3. 漏洞是怎么形成的
（正文内容）

4. 审计时先看什么
（正文内容）

5. 一个贴近业务的小例子
（正文内容：必须包含两段完整的代码——一段"有漏洞的写法"和一段"修复后的写法"，用 Markdown 代码块并带语言标记，代码前后用文字说明业务场景和关键改动点）

### practiceQuestions 格式要求

- 必须恰好 3 道题
- 每道题必须同时包含非空的 questionMarkdown（题面）和 answerMarkdown（参考答案），三道题缺一不可
- 字段名必须严格使用 questionMarkdown / answerMarkdown，不要用 answer、solution 等别名
- 不要使用 HTML 标签（如 <details>、<summary> 等）
- 不要把"学完后立刻自测"相关内容写进 contentMarkdown

## 内容质量要求

- 语言要口语化，但标准引用必须准确
- 如果知识库片段不足以支持某个结论，就明确说"当前上传文档未覆盖这部分细节"`;

export interface ExplanationResult {
  content: string;
  relatedVulnerabilities: string[];
  practiceSuggestions: string[];
}

export interface LearningLessonResult {
  lessonDocument: LessonDocument;
  references: string[];
}

export interface LearningLessonStage {
  label: string;
  detail: string;
  progress: number;
}

type LearningLessonMessage = {
  role: 'system' | 'user';
  content: string;
};

export type LearningLessonStreamChunk =
  | {
      type: 'stage';
      stage: LearningLessonStage;
    }
  | {
      type: 'content';
      content: string;
    }
  | {
      type: 'metadata';
      lesson: LearningLessonResult;
      usage: TokenUsage;
      qualityWarnings?: string[];
      citations?: ToolCitation[];
      grounding?: {
        grounded: boolean;
        issues: string[];
      };
      retrievalTrace?: RetrievalTraceItem[];
    }
  | {
      type: 'error';
      error: string;
    };

function normalizeAgentErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    if (/401|api key|authorization|authentication|unauthorized|MODEL_AUTHENTICATION/i.test(error)) {
      return '模型服务认证失败，请在「设置」页面检查 API Key、模型名称和模型接口地址';
    }
    return /timed?\s*out/i.test(error) ? '学习章节生成超时，请稍后重试' : error;
  }

  if (error instanceof Error) {
    if (/401|api key|authorization|authentication|unauthorized|MODEL_AUTHENTICATION/i.test(error.message)) {
      return '模型服务认证失败，请在「设置」页面检查 API Key、模型名称和模型接口地址';
    }
    return /timed?\s*out/i.test(error.message) ? '学习章节生成超时，请稍后重试' : error.message;
  }

  if (error && typeof error === 'object') {
    const candidates = [
      (error as { message?: unknown }).message,
      (error as { error?: unknown }).error,
      (error as { cause?: { message?: unknown } }).cause?.message,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        if (/401|api key|authorization|authentication|unauthorized|MODEL_AUTHENTICATION/i.test(candidate)) {
          return '模型服务认证失败，请在「设置」页面检查 API Key、模型名称和模型接口地址';
        }
        return /timed?\s*out/i.test(candidate) ? '学习章节生成超时，请稍后重试' : candidate;
      }
    }
  }

  return fallback;
}

function findBalancedJsonObjectCandidate(content: string): string | null {
  for (let start = 0; start < content.length; start += 1) {
    if (content[start] !== '{') {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index += 1) {
      const char = content[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return content.slice(start, index + 1).trim();
        }
      }
    }
  }

  return null;
}

function collectJsonPayloadCandidates(rawContent: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string | null | undefined) => {
    const normalized = candidate?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);
  };

  const trimmed = rawContent.trim();
  push(trimmed.startsWith('{') ? trimmed : null);

  for (const match of trimmed.matchAll(/```json\s*([\s\S]*?)\s*```/gi)) {
    push(match[1]);
  }

  for (const match of trimmed.matchAll(/```[\w-]*\s*([\s\S]*?)\s*```/g)) {
    const block = match[1]?.trim();
    if (block?.startsWith('{') && block.endsWith('}')) {
      push(block);
    }
  }

  push(findBalancedJsonObjectCandidate(trimmed));
  return candidates;
}

function escapeControlCharactersInJsonStrings(candidate: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        result += char;
        escaped = true;
        continue;
      }

      if (char === '"') {
        result += char;
        inString = false;
        continue;
      }

      if (char === '\n') {
        result += '\\n';
        continue;
      }

      if (char === '\r') {
        result += '\\r';
        continue;
      }

      if (char === '\t') {
        result += '\\t';
        continue;
      }

      const code = char.charCodeAt(0);
      if (code < 0x20) {
        result += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }

      result += char;
      continue;
    }

    if (char === '"') {
      inString = true;
    }

    result += char;
  }

  return result;
}

function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repairedCandidate = escapeControlCharactersInJsonStrings(candidate);
    if (repairedCandidate !== candidate) {
      return JSON.parse(repairedCandidate);
    }

    throw error;
  }
}

function stripPracticeSection(contentMarkdown: string): string {
  const normalized = contentMarkdown.replace(/\r\n/g, '\n').trim();
  const practiceSectionPattern = /\n?(?:##\s*)?6[.．、]\s*学完后立刻自测[\s\S]*$/;
  return normalized.replace(practiceSectionPattern, '').trim();
}

function normalizePracticeQuestion(question: LessonPracticeQuestion): LessonPracticeQuestion {
  return {
    questionMarkdown: question.questionMarkdown.trim(),
    answerMarkdown: question.answerMarkdown.trim(),
  };
}

function serializeLessonDocument(document: LessonDocument): string {
  return [
    document.contentMarkdown,
    ...document.practiceQuestions.flatMap((question, index) => ([
      `题目 ${index + 1}`,
      question.questionMarkdown,
      question.answerMarkdown,
    ])),
  ].filter(Boolean).join('\n\n');
}

function parseLegacyLearningLessonDocument(rawContent: string): LessonDocument | null {
  const normalized = rawContent.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  const practiceHeadingMatch = normalized.match(/^(?:##\s*)?6[.．、]\s*学完后立刻自测.*$/m);
  const practiceStartIndex = practiceHeadingMatch?.index;
  const contentPart = practiceStartIndex != null
    ? normalized.slice(0, practiceStartIndex).trim()
    : normalized;
  const practicePart = practiceStartIndex != null
    ? normalized.slice(practiceStartIndex + practiceHeadingMatch![0].length).trim()
    : normalized;

  const detailsPattern = /<details\b[^>]*>\s*<summary\b[^>]*>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/gi;
  const practiceQuestions: LessonPracticeQuestion[] = [];
  let lastIndex = 0;

  for (const match of practicePart.matchAll(detailsPattern)) {
    const matchIndex = match.index ?? 0;
    const questionMarkdown = practicePart.slice(lastIndex, matchIndex).trim();
    const answerMarkdown = match[1]?.trim() || '';

    if (questionMarkdown && answerMarkdown) {
      practiceQuestions.push({
        questionMarkdown,
        answerMarkdown,
      });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (!contentPart || practiceQuestions.length !== 3) {
    return null;
  }

  return {
    contentMarkdown: stripPracticeSection(contentPart),
    practiceQuestions: practiceQuestions.map(normalizePracticeQuestion),
  };
}

interface ParsedLearningLessonDocument {
  lessonDocument: LessonDocument;
  qualityWarnings: string[];
}

function parseLearningLessonDocument(
  rawContent: string,
  context: { topicId?: string; clausePrefix?: string } = {},
): ParsedLearningLessonDocument {
  let lastJsonError: unknown;
  const legacyDocument = parseLegacyLearningLessonDocument(rawContent);

  for (const candidate of collectJsonPayloadCandidates(rawContent)) {
    try {
      const payload = parseJsonCandidate(candidate);
      const normalized = normalizeLearningLessonPayload(payload, {
        legacyPracticeQuestions: legacyDocument?.practiceQuestions,
      });

      if (!normalized) {
        throw new Error('章节 JSON 缺少 contentMarkdown 或 practiceQuestions');
      }

      logLessonParseDiagnostics(normalized.diagnostics, context);
      const qualityWarnings = buildLessonQualityWarnings(normalized.diagnostics);
      const lessonDocument = parseNormalizedLearningLessonDocument({
        contentMarkdown: stripPracticeSection(normalized.contentMarkdown),
        practiceQuestions: normalized.practiceQuestions.map(normalizePracticeQuestion),
      });

      return {
        lessonDocument: {
          contentMarkdown: lessonDocument.contentMarkdown,
          practiceQuestions: lessonDocument.practiceQuestions.map(normalizePracticeQuestion),
        },
        qualityWarnings,
      };
    } catch (error) {
      lastJsonError = error;
    }
  }

  if (legacyDocument) {
    return {
      lessonDocument: legacyDocument,
      qualityWarnings: [],
    };
  }

  throw lastJsonError instanceof Error
    ? lastJsonError
    : new Error('未找到可解析的章节 JSON');
}

function toStructuredLessonParseError(error: unknown): Error {
  if (error instanceof Error && error.message.trim()) {
    return new Error(`模型返回的章节 JSON 格式不正确：${error.message}`);
  }

  return new Error('模型返回的章节 JSON 格式不正确，请稍后重试');
}

function decodeJsonStringEscape(content: string, index: number): { value: string; nextIndex: number } | null {
  const escapeChar = content[index + 1];
  if (!escapeChar) {
    return null;
  }

  switch (escapeChar) {
    case '"':
    case '\\':
    case '/':
      return { value: escapeChar, nextIndex: index + 2 };
    case 'b':
      return { value: '\b', nextIndex: index + 2 };
    case 'f':
      return { value: '\f', nextIndex: index + 2 };
    case 'n':
      return { value: '\n', nextIndex: index + 2 };
    case 'r':
      return { value: '\r', nextIndex: index + 2 };
    case 't':
      return { value: '\t', nextIndex: index + 2 };
    case 'u': {
      const unicodeHex = content.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(unicodeHex)) {
        return null;
      }

      return {
        value: String.fromCharCode(parseInt(unicodeHex, 16)),
        nextIndex: index + 6,
      };
    }
    default:
      return { value: escapeChar, nextIndex: index + 2 };
  }
}

function extractPartialJsonStringField(content: string, fieldName: string): { value: string; complete: boolean } | null {
  const fieldPattern = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'm');
  const match = fieldPattern.exec(content);
  if (!match) {
    return null;
  }

  let index = (match.index ?? 0) + match[0].length;
  let value = '';

  while (index < content.length) {
    const char = content[index];

    if (char === '"') {
      return { value, complete: true };
    }

    if (char === '\\') {
      const decoded = decodeJsonStringEscape(content, index);
      if (!decoded) {
        return { value, complete: false };
      }

      value += decoded.value;
      index = decoded.nextIndex;
      continue;
    }

    value += char;
    index += 1;
  }

  return { value, complete: false };
}

function extractPartialContentMarkdown(rawContent: string): string | null {
  return extractPartialJsonStringField(rawContent, 'contentMarkdown')?.value ?? null;
}

type StructuredLearningLessonStreamEvent =
  | {
      type: 'content';
      contentMarkdown: string;
    }
  | {
      type: 'result';
      rawContent: string;
      lessonDocument: LessonDocument;
      qualityWarnings: string[];
    };

export class ExplainerAgent {
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
   * 讲解错题
   */
  async explainWrongAnswer(params: {
    question: Question;
    userAnswer: number;
    isCorrect: boolean;
  }): Promise<{
    success: boolean;
    explanation?: ExplanationResult;
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
      const evidence = await this.buildExplanationEvidence(params.question);
      let knowledgeContext = '';
      if (evidence.results.length > 0) {
        knowledgeContext = evidence.results
          .map((r, i) => {
            const clauseTag = [
              r.clauseNumber && `条款${r.clauseNumber}`,
              r.sectionPath,
            ].filter(Boolean).join(' — ');
            return `【参考${i + 1}】${clauseTag ? `(${clauseTag}) ` : ''}${r.content}`;
          })
          .join('\n\n---\n\n');
      }

      // 2. 生成讲解内容
      const messages = [
        { role: 'system' as const, content: EXPLAINER_PROMPT },
        {
          role: 'user' as const,
          content: `请讲解以下代码漏洞审计题目：

## 题目信息

**语言**：${params.question.language}
**漏洞类型**：${params.question.vulnerabilityType}
**难度**：${params.question.difficulty}
**标准引用**：${params.question.standardReference}

## 代码示例

\`\`\`${params.question.language.toLowerCase()}
${params.question.code}
\`\`\`

## 问题
${params.question.question}

## 选项
${params.question.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}

## 用户答案
${String.fromCharCode(65 + params.userAnswer)}. ${params.question.options[params.userAnswer]}

## 正确答案
${String.fromCharCode(65 + params.question.correctAnswer)}. ${params.question.options[params.question.correctAnswer]}

## 基础解析
${params.question.explanation}

## 知识库参考
${knowledgeContext || '（无额外知识库内容）'}

${params.isCorrect 
  ? '用户答对了，请给出更深入的扩展讲解。' 
  : '用户答错了，请详细讲解为什么正确答案是对的，用户的理解误区在哪里。'}

请提供完整的讲解内容。`,
        },
      ];

      const response = await this.llmClient.invoke(messages, toLLMConfig(this.config));

      // 3. 提取相关漏洞类型和学习建议
      const extractRelated = (content: string): string[] => {
        const related: string[] = [];
        const patterns = [
          /相关漏洞[：:]\s*([^\n]+)/g,
          /延伸阅读[：:]\s*([^\n]+)/g,
          /类似漏洞[：:]\s*([^\n]+)/g,
        ];
        
        for (const pattern of patterns) {
          const matches = content.matchAll(pattern);
          for (const match of matches) {
            const types = match[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean);
            related.push(...types);
          }
        }
        
        return [...new Set(related)].slice(0, 5);
      };

      const extractPractices = (content: string): string[] => {
        const practices: string[] = [];
        const pattern = /最佳实践[：:]\s*([\s\S]*?)(?=\n##|$)/g;
        const match = pattern.exec(content);
        
        if (match) {
          const lines = match[1].split('\n')
            .map(s => s.replace(/^[-•*]\s*/, '').trim())
            .filter(s => s.length > 0);
          practices.push(...lines);
        }
        
        return practices.slice(0, 5);
      };

      const content = response.content;
      const grounding = await this.toolbox.validateGrounding({
        generatedText: content,
        question: {
          code: params.question.code,
          language: params.question.language,
          standardReference: params.question.standardReference,
          vulnerabilityType: params.question.vulnerabilityType,
        },
        evidenceResults: evidence.results,
        retrievalTrace: evidence.retrievalTrace,
        requireStandardReference: false,
      });

      return {
        success: true,
        explanation: {
          content,
          relatedVulnerabilities: extractRelated(content),
          practiceSuggestions: extractPractices(content),
        },
        usage: createEstimatedUsage({
          messages,
          completionText: response.content,
        }),
        citations: grounding.citations,
        grounding: {
          grounded: grounding.grounded,
          issues: grounding.issues,
        },
        retrievalTrace: grounding.retrievalTrace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '讲解生成失败',
      };
    }
  }

  private async buildExplanationEvidence(question: Question): Promise<{
    results: SearchResultItem[];
    citations: ToolCitation[];
    retrievalTrace: RetrievalTraceItem[];
  }> {
    const scope = this.toolbox.detectLanguageAndScope({
      language: question.language,
      standardReference: question.standardReference,
      vulnerabilityType: question.vulnerabilityType,
    });

    const clauseNumber = question.standardReference.match(/([\d.]+)\s*$/)?.[1];
    const clauseContext = clauseNumber
      ? await this.toolbox.getClauseContext({
          clauseNumber,
          standardTypes: scope.standardTypes,
        })
      : null;
    const searchResult = await this.toolbox.searchStandardClauses({
      queries: [
        `${scope.languageLabel} ${question.vulnerabilityType} 漏洞 条款`,
        `${question.standardReference || ''} ${question.vulnerabilityType}`.trim(),
        `${scope.languageLabel} ${question.vulnerabilityType} 修复`,
      ],
      standardTypes: scope.standardTypes,
      topK: 6,
      threshold: 0.2,
    });

    const results = dedupeKnowledgeResults([
      ...(clauseContext?.results || []),
      ...searchResult.results,
    ]).slice(0, 8);
    const citationsMap = new Map<string, ToolCitation>();

    for (const citation of [...(clauseContext?.citations || []), ...searchResult.citations]) {
      const key = `${citation.docId}:${citation.clauseNumber || ''}:${citation.sectionPath || ''}`;
      citationsMap.set(key, citation);
    }

    return {
      results,
      citations: Array.from(citationsMap.values()),
      retrievalTrace: [
        ...(clauseContext?.retrievalTrace || []),
        ...searchResult.retrievalTrace,
      ],
    };
  }

  private buildLearningLessonMessages(prompt: string): LearningLessonMessage[] {
    return [
      { role: 'system' as const, content: LEARNING_LESSON_PROMPT },
      { role: 'user' as const, content: prompt },
    ];
  }

  private async invokeStructuredLearningLesson(
    messages: LearningLessonMessage[],
    parseContext: { topicId?: string; clausePrefix?: string } = {},
  ) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let responseContent = '';

      try {
        const response = await this.llmClient.invoke(messages, toLLMConfig(this.config));
        responseContent = response.content;

        const parsed = parseLearningLessonDocument(responseContent, parseContext);
        return {
          rawContent: responseContent,
          lessonDocument: parsed.lessonDocument,
          qualityWarnings: parsed.qualityWarnings,
        };
      } catch (error) {
        if (!responseContent) {
          lastError = error;
          break;
        }

        lastError = toStructuredLessonParseError(error);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('模型返回的章节格式不正确，请稍后重试');
  }

  private async *streamStructuredLearningLesson(
    messages: LearningLessonMessage[],
    parseContext: { topicId?: string; clausePrefix?: string } = {},
  ): AsyncGenerator<StructuredLearningLessonStreamEvent> {
    let responseContent = '';
    let lastStreamedContent = '';

    const stream = this.llmClient.stream(messages, toLLMConfig(this.config));
    for await (const chunk of stream) {
      const content = chunk.content?.toString();
      if (!content) {
        continue;
      }

      responseContent += content;
      const partialContentMarkdown = extractPartialContentMarkdown(responseContent);
      if (partialContentMarkdown != null && partialContentMarkdown !== lastStreamedContent) {
        lastStreamedContent = partialContentMarkdown;
        yield {
          type: 'content',
          contentMarkdown: partialContentMarkdown,
        };
      }
    }

    const parsed = parseLearningLessonDocument(responseContent, parseContext);
    yield {
      type: 'result',
      rawContent: responseContent,
      lessonDocument: parsed.lessonDocument,
      qualityWarnings: parsed.qualityWarnings,
    };
  }

  async generateLearningLesson(params: {
    language: LearningTopicLanguage;
    title: string;
    summary: string;
    goals: string[];
    searchQueries: string[];
    standard: string;
    vulnerabilityFocus: string;
  }): Promise<{
    success: boolean;
    lesson?: LearningLessonResult;
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
      const standardInventory = await this.toolbox.listUploadedStandards();
      const availableTypes = standardInventory.standards.map((item) => item.type);
      if (!availableTypes.includes(params.language)) {
        return {
          success: false,
          error: `当前知识库中未上传 ${getLanguageLabel(params.language)} 标准文档，无法生成该学习章节`,
        };
      }

      const searchResult = await this.toolbox.searchStandardClauses({
        queries: params.searchQueries,
        standardTypes: [params.language],
        topK: 6,
        threshold: 0.25,
      });
      const mergedResults = dedupeKnowledgeResults(searchResult.results);

      if (mergedResults.length === 0) {
        return {
          success: false,
          retrievalTrace: searchResult.retrievalTrace,
          error: '当前知识库中没有检索到足够的章节学习内容，请先上传对应标准文档',
        };
      }

      const selectedResults = mergedResults.slice(0, 6);
      const knowledgeContext = selectedResults
        .map((item, index) => {
          const clauseTag = [
            item.clauseNumber && `条款${item.clauseNumber}`,
            item.sectionPath,
          ].filter(Boolean).join(' — ');
          return `[知识片段${index + 1}｜文档${item.docId}｜相似度${item.score.toFixed(3)}${clauseTag ? `｜${clauseTag}` : ''}]\n${item.content}`;
        })
        .join('\n\n---\n\n');

      const messages = this.buildLearningLessonMessages(`请为下面这个新手章节生成导学内容。

章节标题：${params.title}
章节摘要：${params.summary}
聚焦漏洞方向：${params.vulnerabilityFocus}
适用语言：${getLanguageLabel(params.language)}
标准来源：${params.standard}
学习目标：
${params.goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

知识库片段：
${knowledgeContext}

生成要求：
- 只使用上面的知识库片段
- 用适合零基础用户的语言解释
- 审计检查点尽量落成可执行清单
- 小例子允许改写，但不能照搬知识库原始示例代码`);

      const response = await this.invokeStructuredLearningLesson(messages);
      const groundingText = serializeLessonDocument(response.lessonDocument);
      const grounding = await this.toolbox.validateGrounding({
        generatedText: groundingText,
        evidenceResults: selectedResults,
        retrievalTrace: searchResult.retrievalTrace,
        requireStandardReference: false,
      });

      return {
        success: true,
        lesson: {
          lessonDocument: cloneLessonDocument(response.lessonDocument),
          references: Array.from(new Set(selectedResults.map((item) => item.docId))),
        },
        usage: createEstimatedUsage({
          messages,
          completionText: response.rawContent,
        }),
        citations: grounding.citations,
        grounding: {
          grounded: grounding.grounded,
          issues: grounding.issues,
        },
        retrievalTrace: grounding.retrievalTrace,
      };
    } catch (error) {
      console.error('generateLearningLesson failed:', error);
      return {
        success: false,
        error: normalizeAgentErrorMessage(error, '学习章节生成失败'),
      };
    }
  }

  async *generateLearningLessonStream(params: {
    language: LearningTopicLanguage;
    title: string;
    summary: string;
    goals: string[];
    searchQueries: string[];
    standard: string;
    vulnerabilityFocus: string;
  }): AsyncGenerator<LearningLessonStreamChunk> {
    try {
      yield {
        type: 'stage',
        stage: {
          label: '加载知识片段',
          detail: '正在检索与本章相关的标准条款…',
          progress: 12,
        },
      };

      const standardInventory = await this.toolbox.listUploadedStandards();
      const availableTypes = standardInventory.standards.map((item) => item.type);
      if (!availableTypes.includes(params.language)) {
        yield {
          type: 'error',
          error: `当前知识库中未上传 ${getLanguageLabel(params.language)} 标准文档，无法生成该学习章节`,
        };
        return;
      }

      const searchResult = await this.toolbox.searchStandardClauses({
        queries: params.searchQueries,
        standardTypes: [params.language],
        topK: 6,
        threshold: 0.25,
      });
      const mergedResults = dedupeKnowledgeResults(searchResult.results);

      if (mergedResults.length === 0) {
        yield {
          type: 'error',
          error: '当前知识库中没有检索到足够的章节学习内容，请先上传对应标准文档',
        };
        return;
      }

      const selectedResults = mergedResults.slice(0, 6);
      const knowledgeContext = selectedResults
        .map((item, index) => {
          const clauseTag = [
            item.clauseNumber && `条款${item.clauseNumber}`,
            item.sectionPath,
          ].filter(Boolean).join(' — ');
          return `[知识片段${index + 1}｜文档${item.docId}｜相似度${item.score.toFixed(3)}${clauseTag ? `｜${clauseTag}` : ''}]\n${item.content}`;
        })
        .join('\n\n---\n\n');

      const messages = this.buildLearningLessonMessages(`请为下面这个新手章节生成导学内容。

章节标题：${params.title}
章节摘要：${params.summary}
聚焦漏洞方向：${params.vulnerabilityFocus}
适用语言：${getLanguageLabel(params.language)}
标准来源：${params.standard}
学习目标：
${params.goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

知识库片段：
${knowledgeContext}

生成要求：
- 只使用上面的知识库片段
- 用适合零基础用户的语言解释
- 审计检查点尽量落成可执行清单
- 小例子允许改写，但不能照搬知识库原始示例代码`);

      yield {
        type: 'stage',
        stage: {
          label: '生成正文',
          detail: `已整理 ${selectedResults.length} 个知识片段，正在生成章节导学…`,
          progress: 48,
        },
      };

      let response:
        | {
            rawContent: string;
            lessonDocument: LessonDocument;
            qualityWarnings: string[];
          }
        | null = null;

      for await (const event of this.streamStructuredLearningLesson(messages)) {
        if (event.type === 'content') {
          yield {
            type: 'content',
            content: event.contentMarkdown,
          };
          continue;
        }

        response = event;
      }

      if (!response) {
        throw new Error('模型未返回章节内容');
      }

      const groundingText = serializeLessonDocument(response.lessonDocument);

      yield {
        type: 'stage',
        stage: {
          label: '校验引用',
          detail: '正在核对标准条款引用和知识库依据…',
          progress: 86,
        },
      };

      const grounding = await this.toolbox.validateGrounding({
        generatedText: groundingText,
        evidenceResults: selectedResults,
        retrievalTrace: searchResult.retrievalTrace,
        requireStandardReference: false,
      });

      yield {
        type: 'metadata',
        lesson: {
          lessonDocument: cloneLessonDocument(response.lessonDocument),
          references: Array.from(new Set(selectedResults.map((item) => item.docId))),
        },
        usage: createEstimatedUsage({
          messages,
          completionText: response.rawContent,
        }),
        qualityWarnings: response.qualityWarnings.length > 0
          ? response.qualityWarnings
          : undefined,
        citations: grounding.citations,
        grounding: {
          grounded: grounding.grounded,
          issues: grounding.issues,
        },
        retrievalTrace: grounding.retrievalTrace,
      };
    } catch (error) {
      console.error('generateLearningLessonStream failed:', error);
      yield {
        type: 'error',
        error: normalizeAgentErrorMessage(error, '学习章节生成失败'),
      };
    }
  }

  /**
   * 基于文档章节条款前缀生成学习课程（文档驱动路径）
   *
   * 与 generateLearningLesson 的区别：
   * - 不依赖搜索关键词，直接按条款前缀从 SQLite 加载所有相关 chunks
   * - 知识上下文更全面、更精确（不会漏掉子条款）
   */
  async generateLessonFromSection(params: {
    clausePrefix: string;
    topicId: string;
    language: LearningTopicLanguage;
  }): Promise<{
    success: boolean;
    lesson?: LearningLessonResult;
    usage?: TokenUsage;
    qualityWarnings?: string[];
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
    error?: string;
  }> {
    try {
      const lessonContext = await this.toolbox.getSectionLessonContext({
        clausePrefix: params.clausePrefix,
        standardType: params.language,
      });
      const chunks = lessonContext.results;

      if (chunks.length === 0) {
        return {
          success: false,
          retrievalTrace: lessonContext.retrievalTrace,
          error: `未找到条款 ${params.clausePrefix} 的文档内容，请确认知识库中已导入对应标准`,
        };
      }

      const selectedChunks = selectLessonEvidenceChunks(chunks, params.clausePrefix);

      // 2. 组装知识上下文（按条款号排序，保留结构）
      const knowledgeContext = selectedChunks
        .map((chunk, index) => {
          const clauseTag = [
            chunk.clauseNumber && `条款${chunk.clauseNumber}`,
            chunk.sectionPath,
          ].filter(Boolean).join(' — ');
          return `[知识片段${index + 1}｜${clauseTag}]\n${chunk.content}`;
        })
        .join('\n\n---\n\n');

      // 3. 从 chunks 提取章节标题信息
      const sectionTitle = extractSectionTitle(chunks, params.clausePrefix);
      const childTitles = extractChildTitles(chunks, params.clausePrefix);
      const languageLabel = getLanguageLabel(params.language);

      const messages = this.buildLearningLessonMessages(`请基于以下标准文档内容，为新手生成一份导学章节。

章节编号：${params.clausePrefix}
章节标题：${sectionTitle}
适用语言：${languageLabel}
包含的子条款：
${childTitles.map((ct) => `- ${ct.clause} ${ct.title}`).join('\n')}

知识库关键片段（按章节主条款和子条款提炼，共 ${selectedChunks.length} 个片段）：
${knowledgeContext}

生成要求：
- 严格基于上面的知识库原文，不要凭空编造漏洞类型或条款引用
- 每个子条款的核心内容都要覆盖到
- 用适合零基础用户的语言解释
- 审计检查点尽量落成可执行清单
- 小例子允许改写，但不能照搬知识库原始示例代码`);

      const response = await this.invokeStructuredLearningLesson(messages, {
        topicId: params.topicId,
        clausePrefix: params.clausePrefix,
      });
      const groundingText = serializeLessonDocument(response.lessonDocument);
      const grounding = await this.toolbox.validateGrounding({
        generatedText: groundingText,
        evidenceResults: selectedChunks,
        retrievalTrace: lessonContext.retrievalTrace,
        requireStandardReference: false,
      });

      return {
        success: true,
        lesson: {
          lessonDocument: cloneLessonDocument(response.lessonDocument),
          references: Array.from(new Set(chunks.map((c) => c.docId))),
        },
        qualityWarnings: response.qualityWarnings,
        usage: createEstimatedUsage({
          messages,
          completionText: response.rawContent,
        }),
        citations: grounding.citations,
        grounding: {
          grounded: grounding.grounded,
          issues: grounding.issues,
        },
        retrievalTrace: grounding.retrievalTrace,
      };
    } catch (error) {
      console.error('generateLessonFromSection failed:', error);
      return {
        success: false,
        error: normalizeAgentErrorMessage(error, '学习章节生成失败'),
      };
    }
  }

  async *generateLessonFromSectionStream(params: {
    clausePrefix: string;
    topicId: string;
    language: LearningTopicLanguage;
  }): AsyncGenerator<LearningLessonStreamChunk> {
    try {
      yield {
        type: 'stage',
        stage: {
          label: '加载章节条款',
          detail: `正在读取 ${params.clausePrefix} 章节下的标准内容…`,
          progress: 10,
        },
      };

      const lessonContext = await this.toolbox.getSectionLessonContext({
        clausePrefix: params.clausePrefix,
        standardType: params.language,
      });
      const chunks = lessonContext.results;

      if (chunks.length === 0) {
        yield {
          type: 'error',
          error: `未找到条款 ${params.clausePrefix} 的文档内容，请确认知识库中已导入对应标准`,
        };
        return;
      }

      const selectedChunks = selectLessonEvidenceChunks(chunks, params.clausePrefix);
      const knowledgeContext = selectedChunks
        .map((chunk, index) => {
          const clauseTag = [
            chunk.clauseNumber && `条款${chunk.clauseNumber}`,
            chunk.sectionPath,
          ].filter(Boolean).join(' — ');
          return `[知识片段${index + 1}｜${clauseTag}]\n${chunk.content}`;
        })
        .join('\n\n---\n\n');

      const sectionTitle = extractSectionTitle(chunks, params.clausePrefix);
      const childTitles = extractChildTitles(chunks, params.clausePrefix);
      const languageLabel = getLanguageLabel(params.language);
      const messages = this.buildLearningLessonMessages(`请基于以下标准文档内容，为新手生成一份导学章节。

章节编号：${params.clausePrefix}
章节标题：${sectionTitle}
适用语言：${languageLabel}
包含的子条款：
${childTitles.map((ct) => `- ${ct.clause} ${ct.title}`).join('\n')}

知识库关键片段（按章节主条款和子条款提炼，共 ${selectedChunks.length} 个片段）：
${knowledgeContext}

生成要求：
- 严格基于上面的知识库原文，不要凭空编造漏洞类型或条款引用
- 每个子条款的核心内容都要覆盖到
- 用适合零基础用户的语言解释
- 审计检查点尽量落成可执行清单
- 小例子允许改写，但不能照搬知识库原始示例代码`);

      yield {
        type: 'stage',
        stage: {
          label: '生成正文',
          detail: `已提炼 ${selectedChunks.length} 个关键条款片段，正在组织章节导学…`,
          progress: 46,
        },
      };

      let response:
        | {
            rawContent: string;
            lessonDocument: LessonDocument;
            qualityWarnings: string[];
          }
        | null = null;

      for await (const event of this.streamStructuredLearningLesson(messages, {
        topicId: params.topicId,
        clausePrefix: params.clausePrefix,
      })) {
        if (event.type === 'content') {
          yield {
            type: 'content',
            content: event.contentMarkdown,
          };
          continue;
        }

        response = event;
      }

      if (!response) {
        throw new Error('模型未返回章节内容');
      }

      const groundingText = serializeLessonDocument(response.lessonDocument);

      yield {
        type: 'stage',
        stage: {
          label: '校验引用',
          detail: '正在检查条款覆盖范围和输出依据…',
          progress: 86,
        },
      };

      const grounding = await this.toolbox.validateGrounding({
        generatedText: groundingText,
        evidenceResults: selectedChunks,
        retrievalTrace: lessonContext.retrievalTrace,
        requireStandardReference: false,
      });

      yield {
        type: 'metadata',
        lesson: {
          lessonDocument: cloneLessonDocument(response.lessonDocument),
          references: Array.from(new Set(chunks.map((chunk) => chunk.docId))),
        },
        usage: createEstimatedUsage({
          messages,
          completionText: response.rawContent,
        }),
        qualityWarnings: response.qualityWarnings.length > 0
          ? response.qualityWarnings
          : undefined,
        citations: grounding.citations,
        grounding: {
          grounded: grounding.grounded,
          issues: grounding.issues,
        },
        retrievalTrace: grounding.retrievalTrace,
      };
    } catch (error) {
      console.error('generateLessonFromSectionStream failed:', error);
      yield {
        type: 'error',
        error: normalizeAgentErrorMessage(error, '学习章节生成失败'),
      };
    }
  }

  /**
   * 流式讲解错题
   */
  async *explainWrongAnswerStream(params: {
    question: Question;
    userAnswer: number;
    isCorrect: boolean;
  }): AsyncGenerator<{
    type: 'content' | 'metadata';
    content?: string;
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
  }> {
    try {
      const evidence = await this.buildExplanationEvidence(params.question);
      let knowledgeContext = '';
      if (evidence.results.length > 0) {
        knowledgeContext = evidence.results
          .map((r, i) => {
            const clauseTag = [
              r.clauseNumber && `条款${r.clauseNumber}`,
              r.sectionPath,
            ].filter(Boolean).join(' — ');
            return `【参考${i + 1}】${clauseTag ? `(${clauseTag}) ` : ''}${r.content}`;
          })
          .join('\n\n---\n\n');
      }

      // 2. 流式生成讲解
      const messages = [
        { role: 'system' as const, content: EXPLAINER_PROMPT },
        {
          role: 'user' as const,
          content: `请讲解以下代码漏洞审计题目：

## 题目信息
**漏洞类型**：${params.question.vulnerabilityType}
**语言**：${params.question.language}

## 代码示例
\`\`\`${params.question.language.toLowerCase()}
${params.question.code}
\`\`\`

## 问题
${params.question.question}

## 用户答案
${String.fromCharCode(65 + params.userAnswer)}. ${params.question.options[params.userAnswer]}

## 正确答案
${String.fromCharCode(65 + params.question.correctAnswer)}. ${params.question.options[params.question.correctAnswer]}

## 知识库参考
${knowledgeContext || '当前未检索到可用的知识库参考，请明确说明证据不足。'}

${params.isCorrect 
  ? '用户答对了，请给出更深入的扩展讲解。' 
  : '用户答错了，请详细讲解为什么正确答案是对的，用户的理解误区在哪里。'}

请提供完整的讲解内容，使用Markdown格式。`,
        },
      ];

      const stream = this.llmClient.stream(messages, toLLMConfig(this.config));

      for await (const chunk of stream) {
        if (chunk.content) {
          yield { type: 'content', content: chunk.content.toString() };
        }
      }

      yield {
        type: 'metadata',
        citations: evidence.citations,
        grounding: {
          grounded: evidence.citations.length > 0,
          issues: evidence.citations.length > 0 ? [] : ['未检索到可用于讲解的标准证据'],
        },
        retrievalTrace: evidence.retrievalTrace,
      };
    } catch (error) {
      yield {
        type: 'content',
        content: `\n\n**讲解生成失败**: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 生成学习路径建议
   */
  async generateLearningPath(params: {
    wrongQuestions: Question[];
    correctQuestions: Question[];
  }): Promise<{
    success: boolean;
    path?: {
      strengths: string[];
      weaknesses: string[];
      recommendations: string[];
      nextTopics: string[];
    };
    usage?: TokenUsage;
    error?: string;
  }> {
    try {
      const wrongTypes = [...new Set(params.wrongQuestions.map(q => q.vulnerabilityType))];
      const correctTypes = [...new Set(params.correctQuestions.map(q => q.vulnerabilityType))];

      const messages = [
        {
          role: 'system' as const,
          content: '你是一位学习规划专家，根据用户的答题情况生成个性化学习路径。',
        },
        {
          role: 'user' as const,
          content: `请根据以下答题情况生成学习路径建议：

**答错的题目类型**：${wrongTypes.join('、') || '无'}
**答对的题目类型**：${correctTypes.join('、') || '无'}

请分析用户的知识掌握情况，并给出：
1. 已掌握的知识点
2. 需要加强的知识点
3. 学习建议
4. 下一步学习主题

以JSON格式输出：
{
  "strengths": ["已掌握点1", "已掌握点2"],
  "weaknesses": ["薄弱点1", "薄弱点2"],
  "recommendations": ["建议1", "建议2"],
  "nextTopics": ["下一个学习主题1", "下一个学习主题2"]
}`,
        },
      ];

      const response = await this.llmClient.invoke(messages, {
        ...toLLMConfig(this.config),
      });

      const content = response.content.trim()
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```(?:json)?[ \t]*/im, '')
        .replace(/[ \t]*```\s*$/im, '')
        .trim();
      const jsonStr = extractJson(content);
      
      if (!jsonStr) {
        return {
          success: false,
          error: '无法解析学习路径',
        };
      }

      const path = JSON.parse(jsonStr);

      return {
        success: true,
        path,
        usage: createEstimatedUsage({
          messages,
          completionText: response.content,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '学习路径生成失败',
      };
    }
  }
}

/**
 * 从 LLM 输出中提取完整 JSON（数组或对象）
 * 使用括号深度扫描，比正则更可靠
 */
function extractJson(text: string): string | null {
  const start = text.search(/[\[{]/);
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

function dedupeKnowledgeResults(results: SearchResultItem[]): SearchResultItem[] {
  const map = new Map<string, SearchResultItem>();

  for (const item of results) {
    const key = `${item.docId}:${item.content.trim().slice(0, 180)}`;
    const existing = map.get(key);
    if (!existing || item.score > existing.score) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

function selectLessonEvidenceChunks(
  chunks: SearchResultItem[],
  clausePrefix: string,
): SearchResultItem[] {
  const groupedByClause = new Map<string, SearchResultItem[]>();

  for (const chunk of chunks) {
    const clauseNumber = chunk.clauseNumber || clausePrefix;
    const current = groupedByClause.get(clauseNumber) || [];
    current.push(chunk);
    groupedByClause.set(clauseNumber, current);
  }

  return Array.from(groupedByClause.entries())
    .sort(([a], [b]) => compareClauseNumbers(a, b))
    .map(([, clauseChunks]) => (
      [...clauseChunks].sort((left, right) => {
        const chunkTypeDiff = getLessonChunkPriority(left.chunkType) - getLessonChunkPriority(right.chunkType);
        if (chunkTypeDiff !== 0) {
          return chunkTypeDiff;
        }

        return (right.content?.length || 0) - (left.content?.length || 0);
      })[0]
    ))
    .filter(Boolean);
}

function getLessonChunkPriority(chunkType?: string): number {
  switch (chunkType) {
    case 'definition':
      return 0;
    case 'clause':
      return 1;
    case 'general':
      return 2;
    case 'appendix':
      return 3;
    case 'example':
      return 4;
    default:
      return 5;
  }
}

function compareClauseNumbers(left?: string, right?: string): number {
  const leftValue = left || '';
  const rightValue = right || '';

  if (leftValue === rightValue) {
    return 0;
  }

  const leftParts = leftValue.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = rightValue.split('.').map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return leftValue.localeCompare(rightValue, 'zh-CN');
}

/**
 * 从 chunks 的 sectionPath 中提取指定条款号的标题
 */
function extractSectionTitle(
  chunks: Array<{ sectionPath?: string; clauseNumber?: string }>,
  clausePrefix: string,
): string {
  for (const chunk of chunks) {
    if (!chunk.sectionPath) continue;
    const segments = chunk.sectionPath.split(' > ');
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (trimmed.startsWith(clausePrefix + ' ')) {
        let title = trimmed.slice(clausePrefix.length).trim();
        title = title.replace(/\s*\d*\s*[…]+.*$/, '').trim();
        title = title.replace(/漏洞描述[:：].*$/, '').trim();
        title = title.replace(/[。，,].{20,}$/, '').trim();
        if (title.length > 0 && title.length < 60) return title;
      }
    }
  }
  return clausePrefix;
}

/**
 * 从 chunks 中提取子条款标题列表
 */
function extractChildTitles(
  chunks: Array<{ sectionPath?: string; clauseNumber?: string }>,
  clausePrefix: string,
): Array<{ clause: string; title: string }> {
  const seen = new Map<string, string>();

  for (const chunk of chunks) {
    const cn = chunk.clauseNumber || '';
    if (!cn.startsWith(clausePrefix + '.') || cn === clausePrefix) continue;
    if (seen.has(cn)) continue;

    let title = cn;
    if (chunk.sectionPath) {
      const segments = chunk.sectionPath.split(' > ');
      for (const seg of segments) {
        const trimmed = seg.trim();
        if (trimmed.startsWith(cn + ' ')) {
          let extracted = trimmed.slice(cn.length).trim();
          extracted = extracted.replace(/\s*\d*\s*[…]+.*$/, '').trim();
          extracted = extracted.replace(/漏洞描述[:：].*$/, '').trim();
          extracted = extracted.replace(/[。，,].{20,}$/, '').trim();
          if (extracted.length > 0 && extracted.length < 80) {
            title = extracted;
          }
          break;
        }
      }
    }
    seen.set(cn, title);
  }

  return Array.from(seen.entries())
    .sort(([a], [b]) => {
      const ap = a.split('.').map(Number);
      const bp = b.split('.').map(Number);
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        if ((ap[i] || 0) !== (bp[i] || 0)) return (ap[i] || 0) - (bp[i] || 0);
      }
      return 0;
    })
    .map(([clause, title]) => ({ clause, title }));
}
