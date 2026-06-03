import { z } from 'zod';
import type { LessonDocument, LessonPracticeQuestion } from '@/lib/learning/lesson-document';

export const DEFAULT_MISSING_ANSWER_FALLBACK = '请结合本章正文，自行归纳该题的参考答案要点。';

const PRACTICE_QUESTION_FIELD_KEYS = [
  'questionMarkdown',
  'question',
  'prompt',
  'stem',
  'question_markdown',
] as const;

const PRACTICE_ANSWER_FIELD_KEYS = [
  'answerMarkdown',
  'answer',
  'referenceAnswer',
  'refAnswer',
  'solution',
  'explanation',
  'answer_markdown',
] as const;

const EMBEDDED_ANSWER_SPLIT_PATTERNS = [
  /\n(?:#{1,3}\s*)?(?:参考答案|答案|解析)[：:]\s*/i,
  /(?:参考答案|答案|解析)[：:]\s*/i,
] as const;

const learningLessonDocumentSchema = z.object({
  contentMarkdown: z.string().trim().min(1, 'contentMarkdown 不能为空'),
  practiceQuestions: z.array(z.object({
    questionMarkdown: z.string().trim().min(1, 'questionMarkdown 不能为空'),
    answerMarkdown: z.string().trim().min(1, 'answerMarkdown 不能为空'),
  })).length(3, 'practiceQuestions 必须恰好包含 3 道题'),
});

export type PracticeAnswerSource =
  | 'answerMarkdown'
  | 'alias'
  | 'embedded'
  | 'topLevelAnswers'
  | 'legacy'
  | 'fallback';

export interface LessonParseDiagnostics {
  answerSources: PracticeAnswerSource[];
  fallbackAnswerIndexes: number[];
  legacyAnswerIndexes: number[];
  aliasAnswerIndexes: number[];
}

export interface NormalizedLearningLessonPayload {
  contentMarkdown: string;
  practiceQuestions: LessonPracticeQuestion[];
  diagnostics: LessonParseDiagnostics;
}

function pickFirstNonEmptyString(
  source: Record<string, unknown>,
  keys: readonly string[],
): { value: string; key: string | null } {
  for (const key of keys) {
    const coerced = coerceToMarkdownString(source[key]);
    if (coerced) {
      return { value: coerced, key };
    }
  }

  return { value: '', key: null };
}

function coerceToMarkdownString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Record<string, unknown>;
  for (const key of ['text', 'markdown', 'content', 'value']) {
    const nested = record[key];
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  return '';
}

function comparePracticeQuestionKeys(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }

  const leftQuestionNumber = /^q(\d+)$/i.exec(left)?.[1];
  const rightQuestionNumber = /^q(\d+)$/i.exec(right)?.[1];
  if (leftQuestionNumber && rightQuestionNumber) {
    return Number(leftQuestionNumber) - Number(rightQuestionNumber);
  }

  return left.localeCompare(right, undefined, { numeric: true });
}

function splitEmbeddedPracticeAnswer(questionMarkdown: string): {
  questionMarkdown: string;
  answerMarkdown: string;
} {
  let bestMatch: { index: number; length: number } | null = null;

  for (const pattern of EMBEDDED_ANSWER_SPLIT_PATTERNS) {
    const match = questionMarkdown.match(pattern);
    if (match?.index == null || match.index <= 0) {
      continue;
    }

    if (!bestMatch || match.index < bestMatch.index) {
      bestMatch = {
        index: match.index,
        length: match[0].length,
      };
    }
  }

  if (!bestMatch) {
    return {
      questionMarkdown: questionMarkdown.trim(),
      answerMarkdown: '',
    };
  }

  return {
    questionMarkdown: questionMarkdown.slice(0, bestMatch.index).trim(),
    answerMarkdown: questionMarkdown.slice(bestMatch.index + bestMatch.length).trim(),
  };
}

function coercePracticeQuestionsArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry != null && typeof entry === 'object')
    .sort(([leftKey], [rightKey]) => comparePracticeQuestionKeys(leftKey, rightKey))
    .map(([, entry]) => entry);
}

function resolvePracticeAnswer(
  source: Record<string, unknown>,
  questionMarkdown: string,
  fallbackAnswer: string,
  legacyAnswer: string,
  missingAnswerFallback: string,
): { answerMarkdown: string; source: PracticeAnswerSource } {
  const direct = coerceToMarkdownString(source.answerMarkdown);
  if (direct) {
    return { answerMarkdown: direct, source: 'answerMarkdown' };
  }

  for (const key of PRACTICE_ANSWER_FIELD_KEYS) {
    if (key === 'answerMarkdown') {
      continue;
    }

    const aliasValue = coerceToMarkdownString(source[key]);
    if (aliasValue) {
      return { answerMarkdown: aliasValue, source: 'alias' };
    }
  }

  if (fallbackAnswer) {
    return { answerMarkdown: fallbackAnswer, source: 'topLevelAnswers' };
  }

  const split = splitEmbeddedPracticeAnswer(questionMarkdown);
  if (split.answerMarkdown) {
    return { answerMarkdown: split.answerMarkdown, source: 'embedded' };
  }

  if (legacyAnswer) {
    return { answerMarkdown: legacyAnswer, source: 'legacy' };
  }

  return { answerMarkdown: missingAnswerFallback, source: 'fallback' };
}

export function normalizePracticeQuestionEntry(
  entry: unknown,
  options?: {
    fallbackAnswer?: string;
    legacyAnswer?: string;
    missingAnswerFallback?: string;
  },
): (LessonPracticeQuestion & { answerSource: PracticeAnswerSource }) | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const source = entry as Record<string, unknown>;
  let questionMarkdown = pickFirstNonEmptyString(source, PRACTICE_QUESTION_FIELD_KEYS).value;
  const resolved = resolvePracticeAnswer(
    source,
    questionMarkdown,
    options?.fallbackAnswer ?? '',
    options?.legacyAnswer ?? '',
    options?.missingAnswerFallback ?? DEFAULT_MISSING_ANSWER_FALLBACK,
  );

  if (resolved.source === 'embedded') {
    const split = splitEmbeddedPracticeAnswer(questionMarkdown);
    questionMarkdown = split.questionMarkdown;
  }

  if (!questionMarkdown) {
    return null;
  }

  return {
    questionMarkdown,
    answerMarkdown: resolved.answerMarkdown,
    answerSource: resolved.source,
  };
}

function buildDiagnostics(
  questions: Array<LessonPracticeQuestion & { answerSource: PracticeAnswerSource }>,
): LessonParseDiagnostics {
  const answerSources = questions.map((question) => question.answerSource);
  const fallbackAnswerIndexes: number[] = [];
  const legacyAnswerIndexes: number[] = [];
  const aliasAnswerIndexes: number[] = [];

  answerSources.forEach((source, index) => {
    if (source === 'fallback') {
      fallbackAnswerIndexes.push(index);
    } else if (source === 'legacy') {
      legacyAnswerIndexes.push(index);
    } else if (source === 'alias') {
      aliasAnswerIndexes.push(index);
    }
  });

  return {
    answerSources,
    fallbackAnswerIndexes,
    legacyAnswerIndexes,
    aliasAnswerIndexes,
  };
}

export function buildLessonQualityWarnings(diagnostics: LessonParseDiagnostics): string[] {
  const warnings: string[] = [];

  if (diagnostics.fallbackAnswerIndexes.length > 0) {
    const questionNumbers = diagnostics.fallbackAnswerIndexes
      .map((index) => index + 1)
      .join('、');
    warnings.push(
      `第 ${questionNumbers} 道练习题缺少模型给出的参考答案，已使用占位说明。建议重新生成本章以获得完整解析。`,
    );
  }

  if (diagnostics.legacyAnswerIndexes.length > 0 && diagnostics.fallbackAnswerIndexes.length === 0) {
    const questionNumbers = diagnostics.legacyAnswerIndexes
      .map((index) => index + 1)
      .join('、');
    warnings.push(
      `第 ${questionNumbers} 道练习题的参考答案来自旧版 HTML 结构补全，请留意是否与题面一致。`,
    );
  }

  return warnings;
}

export function logLessonParseDiagnostics(
  diagnostics: LessonParseDiagnostics,
  context: { topicId?: string; clausePrefix?: string },
): void {
  if (
    diagnostics.fallbackAnswerIndexes.length === 0
    && diagnostics.legacyAnswerIndexes.length === 0
    && diagnostics.aliasAnswerIndexes.length === 0
  ) {
    return;
  }

  console.warn('[learning-lesson-parse] practice answer normalization applied', {
    topicId: context.topicId,
    clausePrefix: context.clausePrefix,
    ...diagnostics,
  });
}

export function normalizeLearningLessonPayload(
  payload: unknown,
  options?: {
    legacyPracticeQuestions?: LessonPracticeQuestion[];
    missingAnswerFallback?: string;
  },
): NormalizedLearningLessonPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const contentMarkdown = coerceToMarkdownString(root.contentMarkdown)
    || coerceToMarkdownString(root.content);

  const topLevelAnswers = Array.isArray(root.answers)
    ? root.answers.map((answer) => coerceToMarkdownString(answer))
    : [];

  const legacy = options?.legacyPracticeQuestions ?? [];
  const missingAnswerFallback = options?.missingAnswerFallback ?? DEFAULT_MISSING_ANSWER_FALLBACK;
  const rawEntries = coercePracticeQuestionsArray(root.practiceQuestions);
  const practiceQuestions = rawEntries
    .map((entry, index) => normalizePracticeQuestionEntry(entry, {
      fallbackAnswer: topLevelAnswers[index] ?? '',
      legacyAnswer: legacy[index]?.answerMarkdown.trim() ?? '',
      missingAnswerFallback,
    }))
    .filter((entry): entry is LessonPracticeQuestion & { answerSource: PracticeAnswerSource } => entry != null);

  if (!contentMarkdown || practiceQuestions.length !== 3) {
    return null;
  }

  const diagnostics = buildDiagnostics(practiceQuestions);

  return {
    contentMarkdown,
    practiceQuestions: practiceQuestions.map(({ questionMarkdown, answerMarkdown }) => ({
      questionMarkdown,
      answerMarkdown,
    })),
    diagnostics,
  };
}

export function parseNormalizedLearningLessonDocument(
  normalized: { contentMarkdown: string; practiceQuestions: LessonPracticeQuestion[] },
): LessonDocument {
  return learningLessonDocumentSchema.parse(normalized);
}
