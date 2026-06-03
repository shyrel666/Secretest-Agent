'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Bug,
  Check,
  CheckCircle,
  Circle,
  Copy,
  FileCode2,
  Loader2,
  Play,
  Shield,
  Terminal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatAgentElapsed } from '@/lib/format-agent-elapsed';
import { cn } from '@/lib/utils';
import {
  AUDIT_CODE_EXAMPLES,
  AUDIT_PIPELINE,
  type AuditStage,
  resolveActiveAgent,
  resolvePipelineIndex,
  severityConfig,
  type SeverityKey,
} from '@/components/audit/audit-utils';

const AuditMarkdownRenderer = dynamic(
  () => import('@/components/audit/audit-markdown').then((m) => ({ default: m.AuditMarkdownRenderer })),
  { loading: () => <div className="px-4 py-3 text-sm text-muted-foreground">渲染报告中…</div> },
);

const AGENTS = {
  audit: { label: 'AuditAgent', short: 'audit' },
  knowledge: { label: 'Knowledge', short: 'kb' },
  validator: { label: 'Validator', short: 'val' },
} as const;

type AgentId = keyof typeof AGENTS;

interface LogEntry {
  id: string;
  key: string;
  time: string;
  agent: AgentId;
  message: string;
}

export interface AuditAgentWorkspaceProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onExampleSelect: (code: string, name: string) => void;
  isLoading: boolean;
  stages: AuditStage[];
  reportContent: string;
  modelLabel: string;
  severitySummary: { overall: SeverityKey | null; detected: Set<SeverityKey> };
  copiedId: string | null;
  onCopyReport: () => void;
  auditStartTime: number | null;
  activeFileName: string;
}

function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function CodeLineGutter({ lineCount }: { lineCount: number }) {
  const lines = Math.max(1, lineCount);
  return (
    <div
      className="select-none border-r border-border/50 bg-muted/20 px-2.5 py-3 text-right font-mono text-xs leading-6 text-muted-foreground/70"
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <div key={i + 1}>{i + 1}</div>
      ))}
    </div>
  );
}

export function AuditAgentWorkspace({
  input,
  onInputChange,
  onSend,
  onClear,
  onExampleSelect,
  isLoading,
  stages,
  reportContent,
  modelLabel,
  severitySummary,
  copiedId,
  onCopyReport,
  auditStartTime,
  activeFileName,
}: AuditAgentWorkspaceProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = useMemo(() => input.split('\n').length, [input]);
  const pipelineIndex = resolvePipelineIndex(stages);
  const hasReport = reportContent.trim().length > 0;
  const currentStage = stages.find((s) => s.status === 'active') ?? stages[stages.length - 1];
  const activeAgents = useMemo(() => {
    const ids = new Set<AgentId>();
    for (const stage of stages) {
      if (stage.status === 'active') {
        ids.add(resolveActiveAgent(stage.id));
      }
    }
    if (ids.size === 0 && isLoading) ids.add('audit');
    return ids;
  }, [isLoading, stages]);

  useEffect(() => {
    if (auditStartTime == null) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - auditStartTime);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [auditStartTime]);

  useEffect(() => {
    for (const stage of stages) {
      const agent = resolveActiveAgent(stage.id);
      const message = stage.label.trim();
      const key = `${stage.id}::${message}::${stage.status}`;
      setLogEntries((prev) => {
        if (prev.some((e) => e.key === key)) return prev;
        return [
          ...prev.slice(-40),
          {
            id: `${Date.now()}-${prev.length}`,
            key,
            time: formatLogTime(new Date()),
            agent,
            message,
          },
        ];
      });
    }
  }, [stages]);

  useEffect(() => {
    const node = consoleRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logEntries]);

  useEffect(() => {
    const node = reportRef.current;
    if (node && (hasReport || isLoading)) node.scrollTop = node.scrollHeight;
  }, [reportContent, hasReport, isLoading]);

  const elapsedLabel = formatAgentElapsed(elapsedMs);
  const canSend = input.trim().length > 0 && !isLoading;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="agent-workspace flex h-[calc(100dvh-4rem)] flex-col px-4 py-1.5 sm:px-6 sm:py-2 lg:px-8">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[min(96rem,calc(100vw-1.5rem))] flex-col">
        <div className="agent-workspace-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl">
          <header className="flex flex-wrap items-center gap-2.5 border-b border-border/70 bg-muted/25 px-4 py-2.5 sm:px-6 sm:py-3">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-500/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-500/80 sm:h-4 sm:w-4" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 font-mono text-sm text-muted-foreground sm:text-base">
              <Terminal className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="truncate">
                secretest-agent — <span className="text-foreground/90">code-audit</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs sm:text-sm">
              <span className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-muted-foreground">
                {modelLabel}
              </span>
              <span className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-muted-foreground">
                GB/T 34944 · 34943 · 34946
              </span>
              {(isLoading || auditStartTime != null) && (
                <span className="agent-workspace-timer rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 tabular-nums text-primary">
                  {elapsedLabel}
                </span>
              )}
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(5.5rem,24%)]">
            <div className="grid min-h-0 lg:grid-cols-[minmax(12.5rem,14.5rem)_minmax(0,1.15fr)_minmax(16rem,0.95fr)]">
              {/* 左侧：流水线 + 示例 */}
              <aside className="flex min-h-0 flex-col border-b border-border/60 bg-muted/15 lg:border-b-0 lg:border-r">
                <div className="shrink-0 border-b border-border/50 px-4 py-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Audit Pipeline
                  </p>
                  <ol className="mt-3 space-y-0">
                    {AUDIT_PIPELINE.map((step, index) => {
                      const state =
                        pipelineIndex < 0
                          ? 'pending'
                          : index < pipelineIndex
                            ? 'done'
                            : index === pipelineIndex
                              ? isLoading
                                ? 'active'
                                : hasReport
                                  ? 'done'
                                  : 'pending'
                              : 'pending';

                      return (
                        <li key={step.key} className="relative flex gap-2.5 pb-4 last:pb-0">
                          {index < AUDIT_PIPELINE.length - 1 ? (
                            <span
                              className={cn(
                                'absolute left-[11px] top-6 h-[calc(100%-10px)] w-px',
                                state === 'done' ? 'bg-primary/45' : 'bg-border/60',
                              )}
                              aria-hidden="true"
                            />
                          ) : null}
                          <div className="relative z-10 shrink-0">
                            {state === 'done' ? (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            ) : state === 'active' ? (
                              <div className="agent-workspace-step-active flex h-5 w-5 items-center justify-center rounded-full border border-primary/50 bg-primary/15">
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              </div>
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground/35" />
                            )}
                          </div>
                          <div className="min-w-0 pt-0">
                            <p
                              className={cn(
                                'text-sm font-medium leading-snug',
                                state === 'active' && 'text-primary',
                                state === 'done' && 'text-foreground',
                                state === 'pending' && 'text-muted-foreground',
                              )}
                            >
                              {step.title}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {step.description}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Samples
                  </p>
                  <ul className="space-y-1">
                    {AUDIT_CODE_EXAMPLES.map((example) => (
                      <li key={example.name}>
                        <button
                          type="button"
                          onClick={() => onExampleSelect(example.code, example.name)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                            activeFileName === example.name
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-transparent bg-background/40 text-muted-foreground hover:border-border/60 hover:bg-muted/40 hover:text-foreground',
                          )}
                        >
                          <Bug className="h-3.5 w-3.5 shrink-0 text-rose-400/90" />
                          <span className="truncate">{example.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {severitySummary.detected.size > 0 || severitySummary.overall ? (
                    <div className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3">
                      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Risk Signals
                      </p>
                      {severitySummary.overall ? (
                        <p className="mb-2 text-xs text-foreground">
                          总体：<span className={severityConfig[severitySummary.overall].color}>
                            {severityConfig[severitySummary.overall].label}
                          </span>
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(severityConfig) as SeverityKey[]).map((key) => {
                          if (!severitySummary.detected.has(key)) return null;
                          const cfg = severityConfig[key];
                          return (
                            <span
                              key={key}
                              className={cn(
                                'inline-flex items-center gap-1 rounded border border-border/50 px-1.5 py-0.5 text-[10px]',
                                cfg.bgColor,
                                cfg.color,
                              )}
                            >
                              <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                              {cfg.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </aside>

              {/* 中间：代码编辑器 */}
              <section className="flex min-h-0 flex-col border-b border-border/60 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-background/40 px-3 py-2 sm:px-4">
                  <div className="flex min-w-0 items-center gap-2 font-mono text-xs sm:text-sm">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-foreground/90">{activeFileName}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="shrink-0 text-muted-foreground">{lineCount} lines</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 font-mono text-xs"
                      onClick={onClear}
                      disabled={isLoading || (!input.trim() && !hasReport)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      清空
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 font-mono text-xs"
                      onClick={onSend}
                      disabled={!canSend}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {isLoading ? '审计中' : '运行审计'}
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <CodeLineGutter lineCount={lineCount} />
                  <textarea
                    ref={editorRef}
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="// 粘贴或输入待审计代码，Ctrl+Enter 运行审计"
                    spellCheck={false}
                    disabled={isLoading}
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-0 disabled:opacity-70"
                  />
                </div>
                <p className="shrink-0 border-t border-border/40 px-3 py-1.5 font-mono text-[10px] text-muted-foreground/70">
                  Ctrl+Enter 提交 · Shift+Enter 换行
                </p>
              </section>

              {/* 右侧：审计报告 */}
              <section className="flex min-h-0 flex-col bg-background/20">
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 sm:px-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    <span className="font-mono text-xs font-medium text-foreground sm:text-sm">
                      Audit Report
                    </span>
                    {isLoading && !hasReport ? (
                      <span className="agent-work-pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  {hasReport ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 font-mono text-xs"
                      onClick={onCopyReport}
                    >
                      {copiedId === 'report' ? (
                        <Check className="mr-1 h-3 w-3" />
                      ) : (
                        <Copy className="mr-1 h-3 w-3" />
                      )}
                      {copiedId === 'report' ? '已复制' : '复制'}
                    </Button>
                  ) : null}
                </div>

                <div
                  ref={reportRef}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
                >
                  {!hasReport && !isLoading ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Shield className="mb-3 h-12 w-12 text-muted-foreground/25" />
                      <p className="font-mono text-sm text-muted-foreground">等待审计结果</p>
                      <p className="mt-1 max-w-[14rem] text-xs leading-relaxed text-muted-foreground/70">
                        在编辑器中输入代码并运行审计，报告将在此流式输出
                      </p>
                    </div>
                  ) : hasReport ? (
                    <AuditMarkdownRenderer content={reportContent} />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-mono">Agent 正在生成报告…</span>
                      </div>
                      {currentStage ? (
                        <p className="font-mono text-xs text-muted-foreground">{currentStage.label}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* 底部：Agent 控制台 */}
            <div className="flex min-h-0 flex-col border-t border-border/70 bg-muted/10">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="agent-work-pulse-dot h-2 w-2 rounded-full bg-primary" />
                  <span className="font-mono text-xs font-medium text-foreground sm:text-sm">
                    Agent Console
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isLoading ? 'streaming' : hasReport ? 'idle' : 'ready'}
                </span>
              </div>
              <div
                ref={consoleRef}
                className="agent-workspace-console min-h-0 flex-1 overflow-y-auto px-4 py-2.5 font-mono text-xs leading-6 sm:text-sm sm:leading-7"
                role="log"
                aria-live="polite"
              >
                <p className="text-muted-foreground/75">
                  <span className="text-primary/55">$</span> session.start(action=&quot;codeAudit&quot;)
                </p>
                <p className="text-muted-foreground/75">
                  <span className="text-primary/55">$</span> agents.attach([
                  <span className="text-foreground/85">AuditAgent</span>,
                  <span className="text-foreground/85">, Knowledge</span>,
                  <span className="text-foreground/85">, Validator</span>])
                </p>
                {logEntries.map((entry) => (
                  <p key={entry.id} className="mt-1.5 text-muted-foreground">
                    <span className="text-muted-foreground/45">[{entry.time}]</span>{' '}
                    <span className={cn('font-semibold', `agent-log-${entry.agent}`)}>
                      {AGENTS[entry.agent].short}
                    </span>
                    <span className="text-primary/65"> › </span>
                    <span className="text-foreground/88">{entry.message}</span>
                  </p>
                ))}
                {isLoading ? (
                  <p className="mt-2 flex items-center gap-1 text-primary/75">
                    <span className="text-primary/55">›</span>
                    <span className="agent-workspace-cursor inline-block h-[1em] w-1.5 bg-primary/75" />
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 bg-muted/20 px-4 py-2.5 font-mono text-xs sm:px-6 sm:text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="agent-work-pulse-ring relative flex h-3.5 w-3.5 items-center justify-center">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    isLoading ? 'agent-work-pulse-dot bg-primary' : hasReport ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )}
                />
              </span>
              {isLoading ? 'running' : hasReport ? 'completed' : 'ready'}
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="text-muted-foreground">
              stage{' '}
              <span className="text-foreground/90">
                {currentStage?.label ?? (hasReport ? '审计完成' : '待命')}
              </span>
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {(Object.keys(AGENTS) as AgentId[]).map((id) => (
                <span
                  key={id}
                  className={cn(
                    'rounded border px-1.5 py-0.5 transition-colors',
                    activeAgents.has(id)
                      ? 'border-primary/35 bg-primary/10 text-primary'
                      : 'border-transparent text-muted-foreground/45',
                  )}
                >
                  {AGENTS[id].label}
                </span>
              ))}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              elapsed <span className="text-foreground/90">{elapsedLabel}</span>
            </span>
          </footer>
        </div>

        <p className="mt-2 shrink-0 text-center font-mono text-[10px] text-muted-foreground/65 sm:text-xs">
          code-audit · 基于国标知识库的多 Agent 协作审计，支持 Java / C/C++ / C#
        </p>
      </div>
    </div>
  );
}
