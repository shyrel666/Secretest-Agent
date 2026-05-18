import { LLMClient, Config, CozeConfig } from 'coze-coding-dev-sdk';
import type { Question } from './question-generator-agent';
import type { ModelConfig } from './types';
import { toLLMConfig, DEFAULT_CONFIG } from './types';
import { createEstimatedUsage, type TokenUsage } from '@/lib/token-usage';
import { InternalMcpToolbox, type RetrievalTraceItem, type ToolCitation, type ToolSearchResult } from '@/lib/knowledge/mcp-tools';
import type { SearchResultItem } from '@/lib/knowledge';
import { parseReviewOutput } from './output-schemas';
import { validateStandardAlignedQuestion } from './standard-alignment-validator';

// 审核Agent的系统提示词
const REVIEWER_PROMPT = `你是一位资深的代码安全审计专家，负责审核测评题目的质量和准确性。

你的任务是检查题目是否符合以下标准：
1. 代码示例是否真实、准确
2. 漏洞识别是否正确
3. 选项是否有歧义
4. 解析是否清晰、完整
5. 标准引用是否正确
6. 题目代码是否只是照搬知识库中的示例代码；如果只是换少量名字或字面量，也应判为不合格

你不是在审核一道普通安全题，而是在审核“标准能力测量题”。必须额外检查：
7. 题目是否锚定一个具体 GB/T 条款，而不是泛泛引用标准
8. 代码是否能测量该条款要求的审核能力
9. 代码证据是否足够支持唯一正确答案
10. 选项是否围绕条款判定设计，错误选项不能与正确选项语义等价
11. 解析是否说明标准条款、代码证据、正确答案依据和错误选项排除理由
12. 代码中是否存在 unsafe、vuln、risk、injection、漏洞、注入等提示性命名或字符串

## 输出格式（JSON）

{
  "approved": true或false,
  "score": 0-100的评分,
  "issues": ["问题1", "问题2"],
  "suggestions": ["改进建议1", "改进建议2"],
  "correctedQuestion": { /* 如果需要修正，提供修正后的完整题目 */ }
}

如果题目质量合格（score >= 80），approved为true。
如果题目有问题需要修正，提供correctedQuestion。
如果题目无法修正，approved为false。

如果你发现题目代码与知识库中的示例代码过于相似，必须在 issues 中明确指出“照搬示例代码”，并要求改为基于漏洞原理重新构造的业务场景代码。

如果提供 correctedQuestion，修正后的题目必须仍然绑定同一类标准条款，并且代码必须是无注释、无答案提示命名、单一主要漏洞、可审计证据清晰的自然业务代码。`;

export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  correctedQuestion?: Question;
}

export class ReviewerAgent {
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
   * 审核单个题目
   */
  async reviewQuestion(question: Question): Promise<{
    success: boolean;
    result?: ReviewResult;
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
      const hasExactClauseContext = Boolean(clauseContext?.success && clauseContext.results.length > 0);
      const searchResult: ToolSearchResult = hasExactClauseContext
        ? {
            success: true,
            results: [],
            citations: [],
            retrievalTrace: [],
          }
        : await this.toolbox.searchStandardClauses({
            queries: [
              `${scope.languageLabel} ${question.vulnerabilityType} 漏洞 条款`,
              `${question.standardReference || ''} ${question.vulnerabilityType}`.trim(),
              `${scope.languageLabel} ${question.vulnerabilityType} 审计`,
            ],
            standardTypes: scope.standardTypes,
            topK: 6,
            threshold: 0.2,
          });

      const evidenceResults = dedupeEvidence([
        ...(clauseContext?.results || []),
        ...searchResult.results,
      ]);

      let knowledgeContext = '';
      if (evidenceResults.length > 0) {
        knowledgeContext = evidenceResults
          .map((r, i) => {
            const clauseTag = [
              r.clauseNumber && `条款${r.clauseNumber}`,
              r.sectionPath,
            ].filter(Boolean).join(' — ');
            return `【参考${i + 1}】${clauseTag ? `(${clauseTag}) ` : ''}${r.content}`;
          })
          .join('\n\n');
      }

      const messages = [
        { role: 'system' as const, content: REVIEWER_PROMPT },
        {
          role: 'user' as const,
          content: `请审核以下代码漏洞审计题目：

题目：
${JSON.stringify(question, null, 2)}

相关知识库内容：
${knowledgeContext || '（无相关知识库内容）'}

请评估题目质量并给出审核结果。`,
        },
      ];

      const response = await this.llmClient.invoke(messages, toLLMConfig(this.config));

      const content = response.content.trim()
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^```(?:json)?[ \t]*/im, '')
        .replace(/[ \t]*```\s*$/im, '')
        .trim();
      const jsonStr = extractJson(content);
      if (!jsonStr) {
        return {
          success: false,
          error: '无法解析审核结果',
        };
      }

      const validation = parseReviewOutput(JSON.parse(jsonStr));
      if (!validation.success) {
        return {
          success: false,
          error: `审核结果结构校验失败：${validation.issues.join('；')}`,
          usage: createEstimatedUsage({
            messages,
            completionText: response.content,
          }),
          retrievalTrace: [
            ...(clauseContext?.retrievalTrace || []),
            ...searchResult.retrievalTrace,
          ],
        };
      }

      const result: ReviewResult = validation.review;
      const alignedQuestion = result.correctedQuestion || question;
      const alignment = validateStandardAlignedQuestion(alignedQuestion);
      if (!alignment.success) {
        return {
          success: false,
          result,
          usage: createEstimatedUsage({
            messages,
            completionText: response.content,
          }),
          retrievalTrace: [
            ...(clauseContext?.retrievalTrace || []),
            ...searchResult.retrievalTrace,
          ],
          error: `题目未通过标准对齐校验：${alignment.issues.join('；')}`,
        };
      }

      const groundedQuestion = toGroundingCandidate(result.correctedQuestion || question);
      const grounding = await this.toolbox.validateGrounding({
        question: groundedQuestion,
        evidenceResults,
        retrievalTrace: [
          ...(clauseContext?.retrievalTrace || []),
          ...searchResult.retrievalTrace,
        ],
      });

      return {
        success: true,
        result,
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
        error: error instanceof Error ? error.message : '审核失败',
      };
    }
  }

  /**
   * 批量审核题目
   */
  async reviewQuestions(questions: Question[]): Promise<{
    success: boolean;
    results?: Array<{
      question: Question;
      review: ReviewResult;
    }>;
    error?: string;
  }> {
    const results: Array<{
      question: Question;
      review: ReviewResult;
    }> = [];

    for (const question of questions) {
      const result = await this.reviewQuestion(question);
      if (result.success && result.result) {
        results.push({
          question,
          review: result.result,
        });
      }
    }

    return {
      success: true,
      results,
    };
  }

  /**
   * 审核并修正题目
   */
  async reviewAndFix(question: Question): Promise<{
    success: boolean;
    question?: Question;
    review?: ReviewResult;
    usage?: TokenUsage;
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
    error?: string;
  }> {
    const reviewResult = await this.reviewQuestion(question);

    if (!reviewResult.success || !reviewResult.result) {
      return {
        success: false,
        usage: reviewResult.usage,
        citations: reviewResult.citations,
        grounding: reviewResult.grounding,
        retrievalTrace: reviewResult.retrievalTrace,
        error: reviewResult.error || '审核失败',
      };
    }

    const review = reviewResult.result;

    if (reviewResult.grounding && !reviewResult.grounding.grounded) {
      return {
        success: false,
        review,
        usage: reviewResult.usage,
        citations: reviewResult.citations,
        grounding: reviewResult.grounding,
        retrievalTrace: reviewResult.retrievalTrace,
        error: '题目未通过 grounded 校验',
      };
    }

    if (review.approved) {
      return {
        success: true,
        question,
        review,
        usage: reviewResult.usage,
        citations: reviewResult.citations,
        grounding: reviewResult.grounding,
        retrievalTrace: reviewResult.retrievalTrace,
      };
    }

    if (review.correctedQuestion) {
      return {
        success: true,
        question: review.correctedQuestion,
        review,
        usage: reviewResult.usage,
        citations: reviewResult.citations,
        grounding: reviewResult.grounding,
        retrievalTrace: reviewResult.retrievalTrace,
      };
    }

    return {
      success: false,
      review,
      usage: reviewResult.usage,
      citations: reviewResult.citations,
      grounding: reviewResult.grounding,
      retrievalTrace: reviewResult.retrievalTrace,
      error: '题目质量不合格且无法修正',
    };
  }
}

function toGroundingCandidate(question: Question): {
  code?: string;
  language?: string;
  standardReference?: string;
  vulnerabilityType?: string;
} {
  return {
    code: question.code,
    language: question.language,
    standardReference: question.standardReference,
    vulnerabilityType: question.vulnerabilityType,
  };
}

function dedupeEvidence(results: SearchResultItem[]): SearchResultItem[] {
  const seen = new Map<string, SearchResultItem>();

  for (const item of results) {
    const key = `${item.docId}:${item.clauseNumber || ''}:${item.content.trim().slice(0, 160)}`;
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score).slice(0, 8);
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
