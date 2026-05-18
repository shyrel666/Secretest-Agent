import type { ModelConfig, AgentType } from './types';
import { DEFAULT_CONFIG } from './types';
import { KnowledgeAgent } from './knowledge-agent';
import { QuestionGeneratorAgent, Question } from './question-generator-agent';
import { ReviewerAgent } from './reviewer-agent';
import { ExplainerAgent } from './explainer-agent';
import { writeAssessmentGenerationLog } from './assessment-generation-log';
import type { CozeConfig } from 'coze-coding-dev-sdk';
import type { AssessmentLanguage, StandardType } from '@/lib/standards';
import { sumTokenUsage, type TokenUsage } from '@/lib/token-usage';
import type { RetrievalTraceItem, ToolCitation } from '@/lib/knowledge/mcp-tools';
import { shuffleQuestionOptions } from '@/lib/question-option-randomizer';
import { getDocumentSections, isReadableKnowledgeTitle } from '@/lib/knowledge';

// Agent配置集合
export interface AgentsConfig {
  audit?: ModelConfig;
  questionGenerator?: ModelConfig;
  reviewer?: ModelConfig;
  explainer?: ModelConfig;
}

export interface AssessmentGenerationOptions {
  fastReview?: boolean;
  reviewConcurrency?: number;
}

type ReviewAndFixResult = Awaited<ReturnType<ReviewerAgent['reviewAndFix']>>;

interface CoverageTarget {
  standardType: StandardType;
  title: string;
  clauseNumber: string;
}

interface LearningPath {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  nextTopics: string[];
}

/**
 * Agent协调器 - 负责协调多个Agent的工作流程
 */
export class AgentOrchestrator {
  private knowledgeAgent: KnowledgeAgent;
  private questionGenerator: QuestionGeneratorAgent;
  private reviewerAgent: ReviewerAgent;
  private explainerAgent: ExplainerAgent;
  private configs: AgentsConfig;
  private assessmentOptions: AssessmentGenerationOptions;

  constructor(
    customHeaders?: Record<string, string>,
    configs?: AgentsConfig,
    cozeConfig?: CozeConfig,
    assessmentOptions?: AssessmentGenerationOptions,
  ) {
    this.configs = configs || {};
    this.assessmentOptions = normalizeAssessmentGenerationOptions(assessmentOptions);
    this.knowledgeAgent = new KnowledgeAgent(customHeaders, cozeConfig);
    this.questionGenerator = new QuestionGeneratorAgent(customHeaders, this.getConfig('questionGenerator'), cozeConfig);
    this.reviewerAgent = new ReviewerAgent(customHeaders, this.getConfig('reviewer'), cozeConfig);
    this.explainerAgent = new ExplainerAgent(customHeaders, this.getConfig('explainer'), cozeConfig);
  }

  /**
   * 获取指定Agent的配置
   */
  private getConfig(agentType: AgentType): ModelConfig {
    return this.configs[agentType] || DEFAULT_CONFIG;
  }

  /**
   * 完整的出题流程：生成 -> 审核 -> 修正
   */
  async generateApprovedQuestion(params: {
    language?: AssessmentLanguage;
    difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
    vulnerabilityType?: string;
    targetClauseNumber?: string;
    excludedVulnerabilityTypes?: string[];
    coveredVulnerabilityTypes?: string[];
    maxRetries?: number;
    shouldAbort?: () => boolean;
  }): Promise<{
    success: boolean;
    question?: Question;
    reviewScore?: number;
    usage?: TokenUsage;
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
    error?: string;
  }> {
    const maxRetries = params.maxRetries || 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      if (params.shouldAbort?.()) {
        return {
          success: false,
          error: '题目生成已取消',
        };
      }

      attempts++;

      const genResult = await this.questionGenerator.generateQuestion({
        language: params.language,
        difficulty: params.difficulty,
        vulnerabilityType: params.vulnerabilityType,
        targetClauseNumber: params.targetClauseNumber,
        excludedVulnerabilityTypes: params.excludedVulnerabilityTypes,
        coveredVulnerabilityTypes: params.coveredVulnerabilityTypes,
        count: 1,
      });

      if (!genResult.success || !genResult.questions?.[0]) {
        continue;
      }

      const question = genResult.questions[0];

      if (params.shouldAbort?.()) {
        return {
          success: false,
          error: '题目生成已取消',
        };
      }

      if (isFastReviewEligible(question, this.assessmentOptions)) {
        const normalizedType = normalizeVulnerabilityType(question.vulnerabilityType);
        const excludedTypes = (params.excludedVulnerabilityTypes || []).map(normalizeVulnerabilityType);

        if (normalizedType && excludedTypes.includes(normalizedType)) {
          continue;
        }

        return {
          success: true,
          question: shuffleQuestionOptions(question),
          reviewScore: FAST_REVIEW_SCORE,
          usage: genResult.usage,
          citations: genResult.citations,
          grounding: genResult.grounding,
          retrievalTrace: [
            ...(genResult.retrievalTrace || []),
            buildFastReviewTrace(question),
          ],
        };
      }

      const reviewResult = await this.reviewerAgent.reviewAndFix(question);

      if (reviewResult.success && reviewResult.question) {
        const normalizedType = normalizeVulnerabilityType(reviewResult.question.vulnerabilityType);
        const excludedTypes = (params.excludedVulnerabilityTypes || []).map(normalizeVulnerabilityType);

        if (normalizedType && excludedTypes.includes(normalizedType)) {
          continue;
        }

        const finalizedQuestion = shuffleQuestionOptions(reviewResult.question);

        return {
          success: true,
          question: finalizedQuestion,
          reviewScore: reviewResult.review?.score || 0,
          usage: sumTokenUsage([genResult.usage, reviewResult.usage]),
          citations: mergeCitations(genResult.citations, reviewResult.citations),
          grounding: combineGrounding(genResult.grounding, reviewResult.grounding),
          retrievalTrace: [...(genResult.retrievalTrace || []), ...(reviewResult.retrievalTrace || [])],
        };
      }
    }

    return {
      success: false,
      error: `经过${maxRetries}次尝试后仍无法生成合格题目`,
    };
  }

  /**
   * 生成一套审核通过的测评题
   */
  async generateQuizSet(params: {
    totalQuestions?: number;
    language?: AssessmentLanguage;
    vulnerabilityType?: string;
    coveredVulnerabilityTypes?: string[];
    onProgress?: (current: number, total: number) => void;
    onStage?: (stage: { label: string; detail: string; progress: number }) => void;
    shouldAbort?: () => boolean;
  } = {}): Promise<{
    success: boolean;
    questions?: Question[];
    usage?: TokenUsage;
    errors?: string[];
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
  }> {
    const startedAt = Date.now();
    const total = params.totalQuestions || 8;
    const questions: Question[] = [];
    const errors: string[] = [];
    const usages: TokenUsage[] = [];
    const citations: ToolCitation[] = [];
    const groundingIssues: string[] = [];
    const retrievalTrace: RetrievalTraceItem[] = [];
    const distribution = buildDifficultyDistribution(total);
    const seedQuestions: Question[] = [];
    const reviewScores: number[] = [];
    const coverageTargets = params.vulnerabilityType
      ? []
      : buildCoverageExpansionTargets(params.language, params.coveredVulnerabilityTypes || [], total);
    let supplementAttemptCount = 0;
    let duplicateTypeRejectCount = 0;
    let duplicateSimilarityRejectCount = 0;
    let reviewFailureCount = 0;
    let generationFailureCount = 0;
    const abortedError = '题目集生成已取消';
    const maxSupplementAttemptCount = Math.max(total * 3, 8);

    params.onStage?.({
      label: '批量检索知识库',
      detail: '正在按难度批量检索知识库并生成候选题…',
      progress: 18,
    });

    const seedEntries = coverageTargets.length > 0
      ? coverageTargets.map((target, index) => ({
        difficulty: getDifficultyForIndex(index, total),
        count: 1,
        target,
      }))
      : (Object.entries(distribution) as Array<[
        'easy' | 'medium' | 'hard',
        number,
      ]>).map(([difficulty, count]) => ({
        difficulty,
        count,
        target: undefined,
      }));

    const seedResults = await Promise.all(seedEntries.map(async ({ difficulty, count, target }) => {
      if (params.shouldAbort?.() || count <= 0) {
        return {
          difficulty,
          count,
          result: null,
        };
      }

      params.onStage?.({
        label: '批量生成题目',
        detail: target
          ? `正在生成 ${difficultyLabelMap[difficulty]}题：${target.title}…`
          : `正在生成 ${difficultyLabelMap[difficulty]}题候选集（${count} 道）…`,
        progress: getSeedGenerationProgress(difficulty),
      });

      const seedResult = await this.questionGenerator.generateQuestion({
        language: params.language,
        difficulty,
        vulnerabilityType: params.vulnerabilityType || target?.title,
        targetClauseNumber: target?.clauseNumber,
        excludedVulnerabilityTypes: [],
        coveredVulnerabilityTypes: params.coveredVulnerabilityTypes,
        count,
      });

      return {
        difficulty,
        count,
        result: seedResult,
      };
    }));

    for (const { difficulty, result: seedResult } of seedResults) {
      if (!seedResult) {
        continue;
      }

      if (seedResult.usage) {
        usages.push(seedResult.usage);
      }
      citations.push(...(seedResult.citations || []));
      retrievalTrace.push(...(seedResult.retrievalTrace || []));
      if (seedResult.grounding?.issues?.length) {
        groundingIssues.push(...seedResult.grounding.issues);
      }

      if (seedResult.success && seedResult.questions?.length) {
        seedQuestions.push(...seedResult.questions);
      } else {
        generationFailureCount++;
        errors.push(seedResult.error || `${difficulty} 难度题目生成失败`);
      }
    }

    const reviewConcurrency = getReviewConcurrency(this.assessmentOptions);
    params.onStage?.({
      label: '审核候选题目',
      detail: `正在并发审核 ${seedQuestions.length} 道候选题（并发 ${reviewConcurrency}），筛除重复和低质量内容…`,
      progress: 62,
    });

    const reviewResults = params.shouldAbort?.()
      ? []
      : await mapWithConcurrency(seedQuestions, reviewConcurrency, async (question) => (
        isFastReviewEligible(question, this.assessmentOptions)
          ? createFastReviewResult(question)
          : this.reviewerAgent.reviewAndFix(question)
      ));
    const seenQuestionKeys = new Set<string>();

    for (const [index, reviewResult] of reviewResults.entries()) {
      if (params.shouldAbort?.()) {
        break;
      }

      params.onProgress?.(Math.min(index + 1, total), total);
      params.onStage?.({
        label: '审核候选题目',
        detail: `已完成 ${index + 1}/${Math.max(reviewResults.length, 1)} 道候选题审核…`,
        progress: getReviewProgress(index + 1, Math.max(reviewResults.length, 1)),
      });

      if (reviewResult.usage) {
        usages.push(reviewResult.usage);
      }
      citations.push(...(reviewResult.citations || []));
      retrievalTrace.push(...(reviewResult.retrievalTrace || []));
      if (reviewResult.grounding?.issues?.length) {
        groundingIssues.push(...reviewResult.grounding.issues);
      }

      if (!reviewResult.success || !reviewResult.question) {
        reviewFailureCount++;
        errors.push(reviewResult.error || `第${index + 1}题审核失败`);
        continue;
      }

      if (typeof reviewResult.review?.score === 'number') {
        reviewScores.push(reviewResult.review.score);
      }

      const dedupeKey = buildQuestionDedupeKey(reviewResult.question, Boolean(params.vulnerabilityType));
      if (seenQuestionKeys.has(dedupeKey)) {
        duplicateTypeRejectCount++;
        continue;
      }

      if (isQuestionTooSimilarToExisting(reviewResult.question, questions)) {
        duplicateSimilarityRejectCount++;
        continue;
      }

      seenQuestionKeys.add(dedupeKey);
      questions.push(shuffleQuestionOptions(reviewResult.question));
    }

    while (questions.length < total && supplementAttemptCount < maxSupplementAttemptCount) {
      if (params.shouldAbort?.()) {
        break;
      }

      const batchStartIndex = questions.length;
      const missingCount = total - questions.length;
      const remainingAttempts = maxSupplementAttemptCount - supplementAttemptCount;
      const supplementBatchSize = Math.min(
        remainingAttempts,
        reviewConcurrency,
        Math.max(missingCount, 1),
      );
      params.onProgress?.(Math.min(batchStartIndex + 1, total), total);
      params.onStage?.({
        label: '补齐缺失题目',
        detail: `候选题不足，正在并发补 ${supplementBatchSize} 道候选题…`,
        progress: getFallbackProgress(batchStartIndex + 1, total),
      });

      const excludedTypesSnapshot = questions.map((question) => question.vulnerabilityType);
      const supplementResults = await Promise.all(
        Array.from({ length: supplementBatchSize }, async (_, batchIndex) => {
          const attemptNumber = supplementAttemptCount + batchIndex + 1;
          const targetQuestionIndex = Math.min(batchStartIndex + batchIndex, total - 1);
          const supplementTarget = params.vulnerabilityType
            ? undefined
            : pickSupplementCoverageTarget(coverageTargets, targetQuestionIndex, attemptNumber);

          const result = await this.generateApprovedQuestion({
            language: params.language,
            difficulty: getDifficultyForIndex(targetQuestionIndex, total),
            vulnerabilityType: params.vulnerabilityType || supplementTarget?.title,
            targetClauseNumber: params.vulnerabilityType ? undefined : supplementTarget?.clauseNumber,
            excludedVulnerabilityTypes: params.vulnerabilityType ? [] : excludedTypesSnapshot,
            coveredVulnerabilityTypes: params.coveredVulnerabilityTypes,
            shouldAbort: params.shouldAbort,
          });

          return {
            questionNumber: targetQuestionIndex + 1,
            result,
          };
        }),
      );
      supplementAttemptCount += supplementBatchSize;

      for (const { questionNumber, result } of supplementResults) {
        if (questions.length >= total || params.shouldAbort?.()) {
          break;
        }

        if (result.usage) {
          usages.push(result.usage);
        }
        citations.push(...(result.citations || []));
        retrievalTrace.push(...(result.retrievalTrace || []));
        if (result.grounding?.issues?.length) {
          groundingIssues.push(...result.grounding.issues);
        }

        if (!result.success || !result.question) {
          generationFailureCount++;
          errors.push(result.error || `第${questionNumber}题补题失败`);
          continue;
        }

        const dedupeKey = buildQuestionDedupeKey(result.question, Boolean(params.vulnerabilityType));
        if (seenQuestionKeys.has(dedupeKey)) {
          duplicateTypeRejectCount++;
          if (supplementAttemptCount >= maxSupplementAttemptCount) {
            errors.push(`第${questionNumber}题补题多次命中重复漏洞类型`);
            break;
          }
          continue;
        }

        if (isQuestionTooSimilarToExisting(result.question, questions)) {
          duplicateSimilarityRejectCount++;
          if (supplementAttemptCount >= maxSupplementAttemptCount) {
            errors.push(`第${questionNumber}题补题多次命中近似内容`);
            break;
          }
          continue;
        }

        seenQuestionKeys.add(dedupeKey);
        questions.push(shuffleQuestionOptions(result.question));
      }
    }

    params.onStage?.({
      label: '整理题目结果',
      detail: '正在汇总题目、引用与消耗信息…',
      progress: 95,
    });

    if (params.shouldAbort?.()) {
      return {
        success: false,
        usage: sumTokenUsage(usages),
        errors: [abortedError],
        citations: mergeCitations(citations),
        grounding: {
          grounded: groundingIssues.length === 0,
          issues: groundingIssues,
        },
        retrievalTrace,
      };
    }

    if (questions.length < total) {
      const insufficientQuestionError = `题目数量不足：请求 ${total} 道，实际生成 ${questions.length} 道`;
      const failureResult = {
        success: false,
        questions: questions.length > 0 ? shuffleQuestions(questions) : undefined,
        usage: sumTokenUsage(usages),
        errors: errors.length > 0
          ? [...errors, insufficientQuestionError]
          : [insufficientQuestionError],
        citations: mergeCitations(citations),
        grounding: {
          grounded: false,
          issues: groundingIssues,
        },
        retrievalTrace,
      };
      if (!params.shouldAbort?.()) {
        void writeAssessmentGenerationLog({
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        totalRequested: total,
        totalGenerated: questions.length,
        language: params.language,
        vulnerabilityType: params.vulnerabilityType,
        seedCandidateCount: seedQuestions.length,
        reviewedCandidateCount: reviewResults.length,
        acceptedAfterReviewCount: questions.length,
        supplementAttemptCount,
        duplicateTypeRejectCount,
        duplicateSimilarityRejectCount,
        reviewFailureCount,
        generationFailureCount,
        averageReviewScore: getAverageReviewScore(reviewScores),
        groundingIssueCount: groundingIssues.length,
        success: false,
        errors: failureResult.errors,
      }).catch((error) => {
        console.error('Assessment generation log write error:', error);
      });
      }
      return failureResult;
    }

    const successResult = {
      success: true,
      questions: shuffleQuestions(questions).slice(0, total),
      usage: sumTokenUsage(usages),
      errors: errors.length > 0 ? errors : undefined,
      citations: mergeCitations(citations),
      grounding: {
        grounded: groundingIssues.length === 0,
        issues: groundingIssues,
      },
      retrievalTrace,
    };
    if (!params.shouldAbort?.()) {
      void writeAssessmentGenerationLog({
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      totalRequested: total,
      totalGenerated: successResult.questions.length,
      language: params.language,
      vulnerabilityType: params.vulnerabilityType,
      seedCandidateCount: seedQuestions.length,
      reviewedCandidateCount: reviewResults.length,
      acceptedAfterReviewCount: questions.length,
      supplementAttemptCount,
      duplicateTypeRejectCount,
      duplicateSimilarityRejectCount,
      reviewFailureCount,
      generationFailureCount,
      averageReviewScore: getAverageReviewScore(reviewScores),
      groundingIssueCount: groundingIssues.length,
      success: true,
      errors,
    }).catch((error) => {
      console.error('Assessment generation log write error:', error);
    });
    }
    return successResult;
  }

  /**
   * 错题讲解流程
   */
  async explainWrongAnswer(params: {
    question: Question;
    userAnswer: number;
    isCorrect: boolean;
  }): Promise<{
    success: boolean;
    explanation?: string;
    relatedVulnerabilities?: string[];
    practiceSuggestions?: string[];
    usage?: TokenUsage;
    citations?: ToolCitation[];
    grounding?: {
      grounded: boolean;
      issues: string[];
    };
    retrievalTrace?: RetrievalTraceItem[];
    error?: string;
  }> {
    const result = await this.explainerAgent.explainWrongAnswer(params);

    if (result.success && result.explanation) {
      return {
        success: true,
        explanation: result.explanation.content,
        relatedVulnerabilities: result.explanation.relatedVulnerabilities,
        practiceSuggestions: result.explanation.practiceSuggestions,
        usage: result.usage,
        citations: result.citations,
        grounding: result.grounding,
        retrievalTrace: result.retrievalTrace,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * 生成学习报告
   */
  async generateLearningReport(params: {
    answers: Array<{
      question: Question;
      userAnswer: number;
      isCorrect: boolean;
    }>;
  }): Promise<{
    success: boolean;
    report?: {
      totalQuestions: number;
      correctCount: number;
      wrongQuestions: Question[];
      correctQuestions: Question[];
      learningPath: {
        strengths: string[];
        weaknesses: string[];
        recommendations: string[];
        nextTopics: string[];
      };
    };
    usage?: TokenUsage;
    error?: string;
  }> {
    const wrongQuestions = params.answers
      .filter(a => !a.isCorrect)
      .map(a => a.question);

    const correctQuestions = params.answers
      .filter(a => a.isCorrect)
      .map(a => a.question);

    const fallbackPath = buildLocalLearningPath({
      wrongQuestions,
      correctQuestions,
      totalQuestions: params.answers.length,
    });

    const pathResult = await this.explainerAgent.generateLearningPath({
      wrongQuestions,
      correctQuestions,
    });

    return {
      success: true,
      report: {
        totalQuestions: params.answers.length,
        correctCount: correctQuestions.length,
        wrongQuestions,
        correctQuestions,
        learningPath: mergeLearningPath(pathResult.success ? pathResult.path : undefined, fallbackPath),
      },
      usage: pathResult.usage,
    };
  }

  /**
   * 获取知识库Agent
   */
  getKnowledgeAgent(): KnowledgeAgent {
    return this.knowledgeAgent;
  }

  /**
   * 获取讲解Agent
   */
  getExplainerAgent(): ExplainerAgent {
    return this.explainerAgent;
  }
}

function mergeLearningPath(path: Partial<LearningPath> | undefined, fallback: LearningPath): LearningPath {
  return {
    strengths: normalizeLearningPathItems(path?.strengths, fallback.strengths),
    weaknesses: normalizeLearningPathItems(path?.weaknesses, fallback.weaknesses),
    recommendations: normalizeLearningPathItems(path?.recommendations, fallback.recommendations),
    nextTopics: normalizeLearningPathItems(path?.nextTopics, fallback.nextTopics),
  };
}

function normalizeLearningPathItems(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : fallback;
}

function buildLocalLearningPath(params: {
  wrongQuestions: Question[];
  correctQuestions: Question[];
  totalQuestions: number;
}): LearningPath {
  const wrongTypes = summarizeQuestionTypes(params.wrongQuestions);
  const correctTypes = summarizeQuestionTypes(params.correctQuestions);
  const correctOnlyTypes = correctTypes.filter((correctType) => (
    !wrongTypes.some((wrongType) => areRelatedVulnerabilityTypes(correctType.vulnerabilityType, wrongType.vulnerabilityType))
  ));

  const strengths = correctOnlyTypes.length > 0
    ? correctOnlyTypes.map((item) => (
        `${item.vulnerabilityType}：本次答对 ${item.count} 题，说明你对该类漏洞的风险识别较稳定。`
      ))
    : params.correctQuestions.length > 0
      ? [`本次答对 ${params.correctQuestions.length}/${params.totalQuestions} 题，已有一定审计基础，但答对类型仍需结合错题继续巩固。`]
      : ['本次暂未形成稳定掌握点，建议先从错题暴露出的漏洞类型开始补齐。'];

  const weaknesses = wrongTypes.length > 0
    ? wrongTypes.map((item) => (
        `${item.vulnerabilityType}：本次答错 ${item.count} 题，优先回看 ${item.languageLabel} 相关条款和典型危险写法。`
      ))
    : ['本次未暴露明显薄弱点，可继续提高题目难度或扩展到其他语言标准。'];

  const recommendations = wrongTypes.length > 0
    ? wrongTypes.map((item) => (
        `针对 ${item.vulnerabilityType}，建议先复盘错题代码中的输入来源、危险 API 或边界条件，再对照标准条款写出修复规则。`
      ))
    : ['保持当前节奏，下一轮可选择更高难度或混合语言测评，验证知识迁移能力。'];

  const nextTopics = wrongTypes.length > 0
    ? wrongTypes.map((item) => `${item.languageLabel} ${item.vulnerabilityType} 专项练习`)
    : correctTypes.slice(0, 3).map((item) => `${item.languageLabel} ${item.vulnerabilityType} 进阶审计`);

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    recommendations: recommendations.slice(0, 4),
    nextTopics: (nextTopics.length > 0 ? nextTopics : ['混合语言漏洞审计综合练习']).slice(0, 4),
  };
}

function summarizeQuestionTypes(questions: Question[]): Array<{
  vulnerabilityType: string;
  languageLabel: string;
  count: number;
}> {
  const summary = new Map<string, {
    vulnerabilityType: string;
    languages: Set<string>;
    count: number;
  }>();

  for (const question of questions) {
    const vulnerabilityType = question.vulnerabilityType.trim() || '未标注漏洞类型';
    const key = normalizeVulnerabilityType(vulnerabilityType);
    const item = summary.get(key) || {
      vulnerabilityType,
      languages: new Set<string>(),
      count: 0,
    };

    item.count += 1;
    item.languages.add(question.language);
    summary.set(key, item);
  }

  return Array.from(summary.values())
    .sort((left, right) => right.count - left.count || left.vulnerabilityType.localeCompare(right.vulnerabilityType, 'zh-CN'))
    .map((item) => ({
      vulnerabilityType: item.vulnerabilityType,
      languageLabel: Array.from(item.languages).sort().join('/') || '通用',
      count: item.count,
    }));
}

function areRelatedVulnerabilityTypes(left: string, right: string): boolean {
  const normalizedLeft = normalizeVulnerabilityType(left);
  const normalizedRight = normalizeVulnerabilityType(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function normalizeVulnerabilityType(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[\s\-_/()（）,，.:：]/g, '');
}

function buildCoverageExpansionTargets(
  language: AssessmentLanguage | undefined,
  coveredVulnerabilityTypes: string[],
  limit: number,
): CoverageTarget[] {
  const standardTypes = resolveCoverageStandardTypes(language);
  const covered = new Set(coveredVulnerabilityTypes.map(normalizeVulnerabilityType));
  const targets: CoverageTarget[] = [];
  const seen = new Set<string>();

  for (const standardType of standardTypes) {
    const sections = getDocumentSections(standardType);

    for (const section of sections) {
      if (!/^6\.2\.\d+$/.test(section.clauseNumber)) {
        continue;
      }

      for (let index = 0; index < section.childClauses.length; index++) {
        const clauseNumber = section.childClauses[index];
        const title = section.childTitles[index];

        if (!clauseNumber || !title || !isReadableKnowledgeTitle(title)) {
          continue;
        }

        const key = `${standardType}:${clauseNumber}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        targets.push({
          standardType,
          clauseNumber,
          title,
        });
      }
    }
  }

  return targets
    .filter((target) => !covered.has(normalizeVulnerabilityType(target.title)))
    .sort((left, right) => compareClauseNumbers(left.clauseNumber, right.clauseNumber))
    .slice(0, limit);
}

function resolveCoverageStandardTypes(language: AssessmentLanguage | undefined): StandardType[] {
  if (language && language !== 'mixed') {
    return [language];
  }

  return ['java', 'cpp', 'csharp'];
}

function compareClauseNumbers(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index++) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function pickSupplementCoverageTarget(
  targets: CoverageTarget[],
  questionIndex: number,
  supplementAttemptCount: number,
): CoverageTarget | undefined {
  if (targets.length === 0) {
    return undefined;
  }

  const offset = Math.max(supplementAttemptCount - 1, 0);
  return targets[(questionIndex + offset) % targets.length];
}

function buildDifficultyDistribution(total: number): Record<'easy' | 'medium' | 'hard', number> {
  const easy = Math.round(total * 0.3);
  const medium = Math.round(total * 0.5);
  const hard = Math.max(total - easy - medium, 0);

  return { easy, medium, hard };
}

const difficultyLabelMap: Record<'easy' | 'medium' | 'hard', string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const FAST_REVIEW_SCORE = 88;

function getSeedGenerationProgress(difficulty: 'easy' | 'medium' | 'hard'): number {
  if (difficulty === 'easy') {
    return 28;
  }

  if (difficulty === 'medium') {
    return 40;
  }

  return 52;
}

function getReviewProgress(current: number, total: number): number {
  if (total <= 0) {
    return 62;
  }

  return Math.min(88, Math.round(62 + (current / total) * 26));
}

function getFallbackProgress(current: number, total: number): number {
  if (total <= 0) {
    return 90;
  }

  return Math.min(94, Math.round(88 + (current / total) * 6));
}

function getDifficultyForIndex(
  index: number,
  total: number,
): 'easy' | 'medium' | 'hard' {
  if (index < total * 0.3) {
    return 'easy';
  }

  if (index < total * 0.8) {
    return 'medium';
  }

  return 'hard';
}

function buildQuestionDedupeKey(question: Question, allowSameVulnerabilityType: boolean): string {
  const normalizedType = normalizeVulnerabilityType(question.vulnerabilityType);
  if (!allowSameVulnerabilityType) {
    return normalizedType;
  }

  const normalizedCode = question.code
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return `${normalizedType}:${question.standardReference}:${normalizedCode}`;
}

function isQuestionTooSimilarToExisting(candidate: Question, acceptedQuestions: Question[]): boolean {
  const candidateCode = normalizeCodeForSimilarity(candidate.code);
  const candidateLines = splitCodeLines(candidateCode);
  const candidateStem = normalizeQuestionStem(candidate.question);

  return acceptedQuestions.some((question) => {
    const existingCode = normalizeCodeForSimilarity(question.code);
    const existingLines = splitCodeLines(existingCode);
    const lineOverlap = calculateLineOverlapRatio(candidateLines, existingLines);

    if (lineOverlap >= 0.6) {
      return true;
    }

    const sameReference = candidate.standardReference === question.standardReference;
    const sameType = normalizeVulnerabilityType(candidate.vulnerabilityType) === normalizeVulnerabilityType(question.vulnerabilityType);
    const questionSimilarity = calculateTokenOverlapRatio(candidateStem, normalizeQuestionStem(question.question));

    return sameReference && sameType && questionSimilarity >= 0.75;
  });
}

function shuffleQuestions(questions: Question[]): Question[] {
  const copy = [...questions];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
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

function normalizeQuestionStem(question: string): string[] {
  return (question || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function calculateTokenOverlapRatio(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const tokenSetB = new Set(tokensB);
  let overlapCount = 0;

  for (const token of tokensA) {
    if (tokenSetB.has(token)) {
      overlapCount++;
    }
  }

  return overlapCount / Math.max(tokensA.length, 1);
}

function getAverageReviewScore(scores: number[]): number | null {
  if (scores.length === 0) {
    return null;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round((total / scores.length) * 100) / 100;
}

function normalizeAssessmentGenerationOptions(
  options?: AssessmentGenerationOptions,
): Required<AssessmentGenerationOptions> {
  return {
    fastReview: options?.fastReview ?? true,
    reviewConcurrency: normalizeReviewConcurrency(options?.reviewConcurrency ?? 3),
  };
}

function isFastReviewEligible(question: Question, options: AssessmentGenerationOptions): boolean {
  if (options.fastReview === false) {
    return false;
  }

  if (question.difficulty === 'hard') {
    return false;
  }

  const uniqueOptions = new Set(question.options.map((option) => option.trim().toLowerCase()));
  return question.code.trim().length >= 40
    && question.question.trim().length >= 8
    && question.explanation.trim().length >= 20
    && question.options.length === 4
    && uniqueOptions.size === 4
    && question.correctAnswer >= 0
    && question.correctAnswer <= 3
    && /^GB\/T\s*\d{4,5}-\d{4}\s+\d+(?:\.\d+)+$/.test(question.standardReference);
}

function createFastReviewResult(question: Question): ReviewAndFixResult {
  return {
    success: true,
    question,
    review: {
      approved: true,
      score: FAST_REVIEW_SCORE,
      issues: [],
      suggestions: ['已通过结构化校验与知识库 grounding，跳过二次 LLM 审核。'],
    },
    grounding: {
      grounded: true,
      issues: [],
    },
    retrievalTrace: [buildFastReviewTrace(question)],
  };
}

function buildFastReviewTrace(question: Question): RetrievalTraceItem {
  return {
    tool: 'fast_structured_review',
    summary: `${question.difficulty} 题已通过结构化校验与生成阶段 grounding，跳过审核 Agent 调用`,
    hitCount: 1,
    citations: [],
  };
}

function getReviewConcurrency(options: AssessmentGenerationOptions): number {
  return normalizeReviewConcurrency(options.reviewConcurrency ?? 3);
}

function normalizeReviewConcurrency(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.min(Math.max(parsed, 1), 6);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * 创建Agent协调器的工厂函数
 */
export function createAgentOrchestrator(
  headers?: Record<string, string>,
  configs?: AgentsConfig
): AgentOrchestrator {
  return new AgentOrchestrator(headers, configs);
}

function mergeCitations(...groups: Array<ToolCitation[] | undefined>): ToolCitation[] {
  const map = new Map<string, ToolCitation>();

  for (const group of groups) {
    for (const citation of group || []) {
      const key = `${citation.docId}:${citation.clauseNumber || ''}:${citation.sectionPath || ''}`;
      map.set(key, citation);
    }
  }

  return Array.from(map.values());
}

function combineGrounding(
  primary?: { grounded: boolean; issues: string[] },
  secondary?: { grounded: boolean; issues: string[] },
): { grounded: boolean; issues: string[] } | undefined {
  if (!primary && !secondary) {
    return undefined;
  }

  return {
    grounded: Boolean(primary?.grounded ?? true) && Boolean(secondary?.grounded ?? true),
    issues: [...(primary?.issues || []), ...(secondary?.issues || [])],
  };
}
