import { z } from 'zod';
import type { Question } from './question-generator-agent';
import { sanitizeQuestionCode } from './code-sanitizer';

const STANDARD_BY_LANGUAGE = {
  Java: 'GB/T 34944-2017',
  C: 'GB/T 34943-2017',
  'C++': 'GB/T 34943-2017',
  'C#': 'GB/T 34946-2017',
} as const;

const nonEmptyText = z.string().trim().min(1);
const questionCode = z.string()
  .transform((code) => sanitizeQuestionCode(code))
  .pipe(z.string().trim().min(8, '代码示例过短'));

export const questionOutputSchema = z.object({
  id: nonEmptyText,
  code: questionCode,
  language: z.enum(['Java', 'C', 'C++', 'C#']),
  question: nonEmptyText,
  options: z.array(nonEmptyText).length(4, '必须提供 4 个选项'),
  correctAnswer: z.coerce.number().int().min(0).max(3),
  explanation: nonEmptyText,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  vulnerabilityType: nonEmptyText,
  standardReference: z.string()
    .trim()
    .regex(/^GB\/T\s*\d{4,5}-\d{4}\s+\d+(?:\.\d+)+$/, '标准引用必须为“GB/T xxxxx-xxxx x.x.x”格式'),
}).strict().superRefine((question, ctx) => {
  const uniqueOptions = new Set(question.options.map((option) => option.toLowerCase()));
  if (uniqueOptions.size !== question.options.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: '选项内容不能重复',
    });
  }

  const expectedStandard = STANDARD_BY_LANGUAGE[question.language];
  if (!question.standardReference.toUpperCase().startsWith(expectedStandard)) {
    ctx.addIssue({
      code: 'custom',
      path: ['standardReference'],
      message: `${question.language} 题目必须引用 ${expectedStandard}`,
    });
  }
});

export const reviewOutputSchema = z.object({
  approved: z.boolean(),
  score: z.coerce.number().min(0).max(100),
  issues: z.array(nonEmptyText).default([]),
  suggestions: z.array(nonEmptyText).default([]),
  correctedQuestion: questionOutputSchema.nullish().transform((question) => question ?? undefined),
}).strict().superRefine((review, ctx) => {
  if (!review.approved && review.issues.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['issues'],
      message: '未通过审核时必须说明问题',
    });
  }

  if (review.approved && review.score < 80) {
    ctx.addIssue({
      code: 'custom',
      path: ['score'],
      message: 'approved=true 时评分必须不低于 80',
    });
  }
});

export type QuestionOutput = z.infer<typeof questionOutputSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export function parseQuestionOutput(raw: unknown): {
  success: true;
  question: Question;
} | {
  success: false;
  issues: string[];
} {
  const parsed = questionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      issues: formatZodIssues(parsed.error),
    };
  }

  return {
    success: true,
    question: parsed.data,
  };
}

export function parseReviewOutput(raw: unknown): {
  success: true;
  review: ReviewOutput;
} | {
  success: false;
  issues: string[];
} {
  const parsed = reviewOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      issues: formatZodIssues(parsed.error),
    };
  }

  return {
    success: true,
    review: parsed.data,
  };
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
}
