/**
 * 源码项目审计出题领域类型。
 *
 * 这些类型描述 source_code/ 下真实能力验证项目的元数据、漏洞点证据链，
 * 以及它们如何绑定到 GB/T 标准条款、审计任务和出题元数据。
 */

export type ProjectId = 'YM_PT' | 'itstec-24';

export type ProjectAuditTaskType =
  | 'identify'
  | 'trace'
  | 'fix'
  | 'falsePositive'
  | 'variant';

export type SourceRefRole =
  | 'entry'
  | 'controller'
  | 'service'
  | 'mapper'
  | 'sink'
  | 'config'
  | 'utility'
  | 'evidence'
  | 'filter';

export type SeedDifficulty = 'easy' | 'medium' | 'hard';

export interface SourceCodeProjectProfile {
  id: ProjectId;
  name: string;
  root: string;
  language: 'Java';
  description: string;
}

export interface ProjectSourceRef {
  projectId: ProjectId;
  path: string;
  startLine: number;
  endLine: number;
  role: SourceRefRole;
  symbol?: string;
}

export interface ProjectEvidenceStep {
  label: string;
  ref: ProjectSourceRef;
  summary: string;
}

export interface ProjectAuditFindingSeed {
  id: string;
  projectId: ProjectId;
  title: string;
  language: 'Java';
  difficulty: SeedDifficulty;
  standardReference: string;
  vulnerabilityType: string;
  sourceRefs: ProjectSourceRef[];
  evidenceFlow: ProjectEvidenceStep[];
  taskTypes: ProjectAuditTaskType[];
  variantGuidance: string;
  distractorGuidance: string[];
  remediationGuidance: string[];
}

export interface ProjectQuestionMetadata {
  sourceProject: ProjectId;
  auditTaskType: ProjectAuditTaskType;
  findingSeedId: string;
  variantOfFindingId?: string;
  sourceRefs: ProjectSourceRef[];
  evidenceFlow: ProjectEvidenceStep[];
}

export interface ProjectSourceSnippet {
  ref: ProjectSourceRef;
  numberedCode: string;
  code: string;
}

export interface ProjectQuestionContext {
  project: SourceCodeProjectProfile;
  seed: ProjectAuditFindingSeed;
  taskType: ProjectAuditTaskType;
  /**
   * 已带行号的源码片段列表。
   *
   * 同一文件可能存在多个不同行段（如 controller 的完整方法体与入口参数段），
   * 因此用数组承载而非以 path 为 key —— 后者会让同 path 的行段相互覆盖丢失证据。
   */
  sourceSnippets: ProjectSourceSnippet[];
}

export interface ProjectSeedPlanEntry {
  seed: ProjectAuditFindingSeed;
  taskType: ProjectAuditTaskType;
  difficulty: SeedDifficulty;
}

export type ProjectMode = 'source' | 'variant' | 'mixed';

export type SourceProjectSelection = ProjectId | 'all';

export const PROJECT_IDS: readonly ProjectId[] = ['YM_PT', 'itstec-24'] as const;

export const PROJECT_AUDIT_TASK_TYPES: readonly ProjectAuditTaskType[] = [
  'identify',
  'trace',
  'fix',
  'falsePositive',
  'variant',
] as const;

export function isProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && (PROJECT_IDS as readonly string[]).includes(value);
}

export function isProjectAuditTaskType(value: unknown): value is ProjectAuditTaskType {
  return typeof value === 'string'
    && (PROJECT_AUDIT_TASK_TYPES as readonly string[]).includes(value);
}

export function isProjectMode(value: unknown): value is ProjectMode {
  return value === 'source' || value === 'variant' || value === 'mixed';
}

export function isSourceProjectSelection(value: unknown): value is SourceProjectSelection {
  return value === 'all' || isProjectId(value);
}
