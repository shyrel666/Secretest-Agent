'use client';

import { ChevronRight, FileCode, FolderTree, ShieldCheck, Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProjectAuditTaskType, ProjectSourceRef, ProjectEvidenceStep } from '@/lib/project-audit/types';
import { cn } from '@/lib/utils';

const TASK_TYPE_LABEL: Record<ProjectAuditTaskType, string> = {
  identify: '识别漏洞',
  trace: '追踪调用链',
  fix: '给出修复',
  falsePositive: '判断误报',
  variant: '同构变体',
};

const ROLE_LABEL: Record<ProjectSourceRef['role'], string> = {
  entry: '入口参数',
  controller: '控制器',
  service: '业务处理',
  mapper: '数据访问',
  sink: '危险操作',
  config: '系统配置',
  utility: '工具/加密',
  evidence: '证据片段',
  filter: '过滤器',
};

interface ProjectSourceEvidenceProps {
  projectId: 'YM_PT' | 'itstec-24';
  auditTaskType?: ProjectAuditTaskType;
  findingSeedId?: string;
  findingTitle?: string;
  sourceRefs?: ProjectSourceRef[];
  evidenceFlow?: ProjectEvidenceStep[];
  className?: string;
}

function buildShortPath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 3) {
    return path;
  }
  return `…/${parts.slice(-3).join('/')}`;
}

export function buildPublicFindingLabel(findingSeedId?: string, findingTitle?: string): string | null {
  const raw = findingTitle || findingSeedId;
  if (!raw) {
    return null;
  }

  let hash = 0;
  for (let index = 0; index < raw.length; index++) {
    hash = ((hash * 31) + raw.charCodeAt(index)) >>> 0;
  }

  return `证据编号 F-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

export function ProjectSourceEvidence({
  projectId,
  auditTaskType,
  findingSeedId,
  findingTitle,
  sourceRefs,
  evidenceFlow,
  className,
}: ProjectSourceEvidenceProps) {
  if (!projectId) {
    return null;
  }
  const projectName = projectId === 'YM_PT' ? 'YM_PT 体检系统' : 'itstec-24 支付系统';
  const publicFindingLabel = buildPublicFindingLabel(findingSeedId, findingTitle);
  return (
    <div
      className={cn(
        'rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4',
        className,
      )}
      data-testid="project-source-evidence"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="font-mono text-xs uppercase tracking-wider text-primary">源码证据</span>
        <Badge variant="secondary" className="h-5 px-2 text-[11px]">
          {projectName}
        </Badge>
        {auditTaskType ? (
          <Badge variant="outline" className="h-5 px-2 text-[11px]">
            {TASK_TYPE_LABEL[auditTaskType] || auditTaskType}
          </Badge>
        ) : null}
        {publicFindingLabel ? (
          <Badge variant="outline" className="h-5 max-w-[min(100%,18rem)] truncate px-2 text-[11px]">
            {publicFindingLabel}
          </Badge>
        ) : null}
      </div>

      {sourceRefs && sourceRefs.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">代码证据</p>
          <ul className="space-y-1.5">
            {sourceRefs.map((ref, index) => (
              <li
                key={`${ref.path}-${ref.startLine}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs"
              >
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <code className="font-mono text-[11px] text-foreground/90" title={ref.path}>
                  {buildShortPath(ref.path)}
                </code>
                <span className="font-mono text-[11px] text-muted-foreground">
                  L{ref.startLine}-{ref.endLine}
                </span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {ROLE_LABEL[ref.role] || ref.role}
                </Badge>
                {ref.symbol ? (
                  <span className="font-mono text-[10px] text-muted-foreground/80">{ref.symbol}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {evidenceFlow && evidenceFlow.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <Workflow className="h-3 w-3" />
            证据流
          </p>
          <ol className="space-y-1.5">
            {evidenceFlow.map((step, index) => (
              <li
                key={`${step.ref.path}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 text-[11px] text-muted-foreground"
              >
                <FolderTree className="h-3 w-3 text-primary" />
                <span className="font-mono text-[10px] font-medium text-foreground/80">
                  {index + 1}. {step.label}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                <code className="font-mono text-[10px]" title={step.ref.path}>
                  {buildShortPath(step.ref.path)}:L{step.ref.startLine}-{step.ref.endLine}
                </code>
                <span className="text-[10px] leading-snug">{step.summary}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
