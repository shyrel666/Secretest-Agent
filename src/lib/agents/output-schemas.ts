import { z } from 'zod';
import type { Question } from './question-generator-agent';
import { sanitizeQuestionCode } from './code-sanitizer';
import {
  isProjectAuditTaskType,
  isProjectId,
  type ProjectAuditFindingSeed,
  type ProjectAuditTaskType,
  type ProjectEvidenceStep,
  type ProjectSourceRef,
} from '@/lib/project-audit/types';
import { readProjectSourceSnippet } from '@/lib/project-audit/source-reader';

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

const projectSourceRefSchema = z.object({
  projectId: z.string().refine(isProjectId, '未知 sourceProject'),
  path: nonEmptyText,
  startLine: z.coerce.number().int().positive(),
  endLine: z.coerce.number().int().positive(),
  role: z.enum(['entry', 'controller', 'service', 'mapper', 'sink', 'config', 'utility', 'evidence', 'filter']),
  symbol: z.string().optional(),
}).strict();

const projectEvidenceStepSchema = z.object({
  label: nonEmptyText,
  ref: projectSourceRefSchema,
  summary: nonEmptyText,
}).strict();

const projectMetadataSchema = z.object({
  sourceProject: z.string().refine(isProjectId, '未知 sourceProject'),
  auditTaskType: z.string().refine(isProjectAuditTaskType, '未知 auditTaskType'),
  findingSeedId: nonEmptyText,
  variantOfFindingId: z.string().optional(),
  sourceRefs: z.array(projectSourceRefSchema).min(1, '源码项目题必须提供至少 1 个 sourceRefs').default([]),
  evidenceFlow: z.array(projectEvidenceStepSchema).default([]),
}).strict().superRefine((meta, ctx) => {
  if (meta.auditTaskType === 'variant' && !meta.variantOfFindingId) {
    ctx.addIssue({
      code: 'custom',
      path: ['variantOfFindingId'],
      message: '变体题必须提供 variantOfFindingId',
    });
  }
});

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
  sourceProject: z.string().refine(isProjectId, '未知 sourceProject').optional(),
  auditTaskType: z.string().refine(isProjectAuditTaskType, '未知 auditTaskType').optional(),
  findingSeedId: z.string().optional(),
  variantOfFindingId: z.string().optional(),
  sourceRefs: z.array(projectSourceRefSchema).optional(),
  evidenceFlow: z.array(projectEvidenceStepSchema).optional(),
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

  const hasAnyProjectField = Boolean(
    question.sourceProject
    || question.auditTaskType
    || question.findingSeedId
    || (question.sourceRefs && question.sourceRefs.length > 0)
    || (question.evidenceFlow && question.evidenceFlow.length > 0)
    || question.variantOfFindingId,
  );

  if (hasAnyProjectField) {
    if (!question.sourceProject) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceProject'],
        message: '项目元数据不完整：缺少 sourceProject',
      });
    }
    if (!question.auditTaskType) {
      ctx.addIssue({
        code: 'custom',
        path: ['auditTaskType'],
        message: '项目元数据不完整：缺少 auditTaskType',
      });
    }
    if (!question.findingSeedId) {
      ctx.addIssue({
        code: 'custom',
        path: ['findingSeedId'],
        message: '项目元数据不完整：缺少 findingSeedId',
      });
    }
    if (!question.sourceRefs || question.sourceRefs.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceRefs'],
        message: '项目元数据不完整：至少需要 1 个 sourceRefs',
      });
    }
    // variant 题必须同时带 findingSeedId（与变体源一致）与 variantOfFindingId
    if (question.auditTaskType === 'variant') {
      if (!question.variantOfFindingId) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantOfFindingId'],
          message: '变体题必须提供 variantOfFindingId',
        });
      } else if (question.findingSeedId && question.variantOfFindingId !== question.findingSeedId) {
        // variantOfFindingId 应当指向与 findingSeedId 同一漏洞模式
        // 这里只做基础一致性检查；详细 seed 存在性由 validator 二次校验
        ctx.addIssue({
          code: 'custom',
          path: ['variantOfFindingId'],
          message: 'variantOfFindingId 应与 findingSeedId 保持一致',
        });
      }
    }
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

export interface ProjectQuestionSeedContext {
  seed: ProjectAuditFindingSeed;
  taskType: ProjectAuditTaskType;
}

export function parseQuestionOutput(raw: unknown, projectSeed?: ProjectQuestionSeedContext): {
  success: true;
  question: Question;
} | {
  success: false;
  issues: string[];
} {
  const parsed = questionOutputSchema.safeParse(
    projectSeed ? withProjectSeedMetadata(raw, projectSeed) : raw,
  );
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

function withProjectSeedMetadata(raw: unknown, projectSeed: ProjectQuestionSeedContext): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }

  const modelOutput = raw as Record<string, unknown>;
  const trustedSourceCode = projectSeed.taskType === 'variant'
    ? ''
    : getTrustedProjectSourceCode(projectSeed.seed);

  return {
    ...modelOutput,
    code: trustedSourceCode || modelOutput.code,
    language: 'Java',
    explanation: withTrustedProjectEvidence(modelOutput.explanation, projectSeed),
    vulnerabilityType: projectSeed.seed.vulnerabilityType,
    standardReference: projectSeed.seed.standardReference,
    sourceProject: projectSeed.seed.projectId,
    auditTaskType: projectSeed.taskType,
    findingSeedId: projectSeed.seed.id,
    variantOfFindingId: projectSeed.taskType === 'variant' ? projectSeed.seed.id : undefined,
    sourceRefs: projectSeed.seed.sourceRefs,
    evidenceFlow: projectSeed.seed.evidenceFlow,
  };
}

function getTrustedProjectSourceCode(seed: ProjectAuditFindingSeed): string {
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const ref of seed.sourceRefs) {
    const key = `${ref.projectId}:${ref.path}:${ref.startLine}-${ref.endLine}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    try {
      const code = sanitizeQuestionCode(readProjectSourceSnippet(ref).code);
      if (code) {
        snippets.push(code);
      }
    } catch {
      // 调用方会在项目上下文构建阶段处理源码读取失败；这里保留模型原始 code 作为兜底。
    }
  }

  return snippets.join('\n\n');
}

function withTrustedProjectEvidence(explanation: unknown, projectSeed: ProjectQuestionSeedContext): string {
  const base = typeof explanation === 'string' ? explanation.trim() : '';
  const evidence = projectSeed.seed.sourceRefs
    .map((ref) => `${ref.path}:${ref.startLine}-${ref.endLine}${ref.symbol ? ` ${ref.symbol}` : ''}`)
    .join('；');
  const trustedEvidence = `项目证据：${projectSeed.seed.projectId} ${evidence}；标准引用：${projectSeed.seed.standardReference}。`;

  if (!base) {
    return trustedEvidence;
  }

  return `${base}\n\n${trustedEvidence}`;
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
