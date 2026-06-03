'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Circle, Loader2, Terminal } from 'lucide-react';
import { formatAgentElapsed } from '@/lib/format-agent-elapsed';
import { sanitizeGenerationStageDetail } from '@/lib/sanitize-generation-stage-detail';
import { cn } from '@/lib/utils';

type FlowStageKey = 'setup' | 'generation' | 'finalize';

interface FlowStage {
  key: FlowStageKey;
  title: string;
  description: string;
}

interface GenerationStage {
  label: string;
  detail: string;
  progress: number;
}

interface GenerationAgentWorkspaceProps {
  startTime: number | null;
  stage: GenerationStage;
  activeStageKey: FlowStageKey;
  flowStages: readonly FlowStage[];
  questionCount: number;
  languageLabel: string;
}

interface LogEntry {
  id: string;
  key: string;
  time: string;
  agent: AgentId;
  message: string;
}

type AgentId = 'orchestrator' | 'knowledge' | 'questionGenerator' | 'reviewer';

const AGENTS: Record<AgentId, { label: string; short: string }> = {
  orchestrator: { label: 'Orchestrator', short: 'orch' },
  knowledge: { label: 'Knowledge', short: 'kb' },
  questionGenerator: { label: 'QuestionGen', short: 'gen' },
  reviewer: { label: 'Reviewer', short: 'rev' },
};

function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function resolveActiveAgent(label: string): AgentId {
  if (label.includes('准备') || label.includes('整理')) return 'orchestrator';
  if (label.includes('检索')) return 'knowledge';
  if (label.includes('审核')) return 'reviewer';
  if (label.includes('生成') || label.includes('补齐')) return 'questionGenerator';
  return 'orchestrator';
}

function resolveActiveAgents(label: string): AgentId[] {
  const primary = resolveActiveAgent(label);
  if (primary === 'questionGenerator') return ['knowledge', 'questionGenerator', 'reviewer'];
  if (primary === 'knowledge') return ['knowledge', 'questionGenerator'];
  if (primary === 'reviewer') return ['reviewer', 'questionGenerator'];
  return ['orchestrator'];
}

export function GenerationAgentWorkspace({
  startTime,
  stage,
  activeStageKey,
  flowStages,
  questionCount,
  languageLabel,
}: GenerationAgentWorkspaceProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startTime == null) {
      setElapsedMs(0);
      return;
    }
    const tick = () => setElapsedMs(Date.now() - startTime);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [startTime]);

  useEffect(() => {
    const agent = resolveActiveAgent(stage.label);
    const rawMessage = stage.detail?.trim() || stage.label;
    const message = sanitizeGenerationStageDetail(rawMessage);
    const key = `${stage.label}::${message}`;

    setLogEntries((prev) => {
      if (prev.some((entry) => entry.key === key)) return prev;
      const next: LogEntry = {
        id: `${Date.now()}-${prev.length}`,
        key,
        time: formatLogTime(new Date()),
        agent,
        message,
      };
      return [...prev.slice(-48), next];
    });
  }, [stage.detail, stage.label]);

  useEffect(() => {
    const node = consoleRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logEntries, stage.detail]);

  const elapsedLabel = formatAgentElapsed(elapsedMs);
  const progress = Math.min(100, Math.max(0, stage.progress));
  const activeAgents = useMemo(() => resolveActiveAgents(stage.label), [stage.label]);

  const activeIndex = flowStages.findIndex((item) => item.key === activeStageKey);

  return (
    <div className="agent-workspace flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-[min(76rem,calc(100vw-4rem))] flex-col">
        <div className="agent-workspace-panel flex h-[min(720px,calc(100dvh-11rem))] max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl">
          {/* Window chrome */}
          <header className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-muted/25 px-5 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-500/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-500/80 sm:h-4 sm:w-4" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 font-mono text-sm text-muted-foreground sm:text-base">
              <Terminal className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="truncate">
                secretest-agent — <span className="text-foreground/90">quiz-generation</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 font-mono text-sm sm:text-base">
              <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-muted-foreground">
                {languageLabel} · {questionCount} 题
              </span>
              <span className="agent-workspace-timer rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-base tabular-nums text-primary sm:text-lg">
                {elapsedLabel}
              </span>
              <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 tabular-nums text-foreground/90">
                {Math.round(progress)}%
              </span>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(260px,20rem)_1fr]">
            {/* Pipeline sidebar */}
            <aside className="border-b border-border/60 bg-muted/15 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
              <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Task Pipeline
              </p>
              <ol className="space-y-0">
                {flowStages.map((flowStage, index) => {
                  const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';

                  return (
                    <li key={flowStage.key} className="relative flex gap-4 pb-6 last:pb-0">
                      {index < flowStages.length - 1 ? (
                        <span
                          className={cn(
                            'absolute left-[13px] top-8 h-[calc(100%-14px)] w-px sm:left-[15px]',
                            state === 'done' ? 'bg-primary/50' : 'bg-border/70',
                          )}
                          aria-hidden="true"
                        />
                      ) : null}
                      <div className="relative z-10 mt-0.5 shrink-0">
                        {state === 'done' ? (
                          <CheckCircle className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
                        ) : state === 'active' ? (
                          <div className="agent-workspace-step-active flex h-7 w-7 items-center justify-center rounded-full border border-primary/50 bg-primary/15 sm:h-8 sm:w-8">
                            <Loader2 className="h-4 w-4 animate-spin text-primary sm:h-5 sm:w-5" />
                          </div>
                        ) : (
                          <Circle className="h-7 w-7 text-muted-foreground/40 sm:h-8 sm:w-8" />
                        )}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p
                          className={cn(
                            'text-base font-medium leading-snug sm:text-lg',
                            state === 'active' && 'text-primary',
                            state === 'done' && 'text-foreground',
                            state === 'pending' && 'text-muted-foreground',
                          )}
                        >
                          {flowStage.title}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                          {flowStage.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-8 rounded-xl border border-border/50 bg-background/40 p-4 sm:p-5">
                <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Current Task
                </p>
                <p className="text-base font-medium text-foreground sm:text-lg">{stage.label}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="agent-work-progress-fill h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </aside>

            {/* Console */}
            <section className="flex min-h-0 flex-1 flex-col bg-background/30">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3 sm:px-7 sm:py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="agent-work-pulse-dot h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="font-mono text-sm font-medium text-foreground sm:text-base">Live Output</span>
                </div>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground sm:text-sm">
                  streaming
                </span>
              </div>

              <div
                ref={consoleRef}
                className="agent-workspace-console min-h-0 flex-1 overflow-y-auto px-5 py-5 font-mono text-sm leading-7 sm:px-7 sm:py-6 sm:text-base sm:leading-8"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                <p className="text-muted-foreground/80">
                  <span className="text-primary/60">$</span> session.start(action=&quot;generateQuizSet&quot;)
                </p>
                <p className="mt-1 text-muted-foreground/80">
                  <span className="text-primary/60">$</span> agents.attach([
                  <span className="text-foreground/80">Knowledge</span>,
                  <span className="text-foreground/80">, QuestionGen</span>,
                  <span className="text-foreground/80">, Reviewer</span>])
                </p>

                {logEntries.map((entry) => (
                  <p key={entry.id} className="mt-2 text-muted-foreground">
                    <span className="text-muted-foreground/50">[{entry.time}]</span>{' '}
                    <span className={cn('font-semibold', `agent-log-${entry.agent}`)}>
                      {AGENTS[entry.agent].short}
                    </span>
                    <span className="text-primary/70"> › </span>
                    <span className="text-foreground/90">{entry.message}</span>
                  </p>
                ))}

                <p className="mt-3 flex items-center gap-1 text-primary/80">
                  <span className="text-primary/60">›</span>
                  <span className="agent-workspace-cursor inline-block h-[1.1em] w-2 bg-primary/80" />
                </p>
              </div>
            </section>
          </div>

          {/* Status line */}
          <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 bg-muted/20 px-5 py-3 font-mono text-xs sm:px-7 sm:py-3.5 sm:text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="agent-work-pulse-ring relative flex h-4 w-4 items-center justify-center">
                <span className="agent-work-pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              running
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="text-muted-foreground">
              stage <span className="text-foreground/90">{stage.label}</span>
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {(['orchestrator', 'knowledge', 'questionGenerator', 'reviewer'] as AgentId[]).map((id) => {
                const active = activeAgents.includes(id);
                return (
                  <span
                    key={id}
                    className={cn(
                      'rounded border px-1.5 py-0.5 transition-colors',
                      active
                        ? 'border-primary/35 bg-primary/10 text-primary'
                        : 'border-transparent text-muted-foreground/50',
                    )}
                  >
                    {AGENTS[id].label}
                  </span>
                );
              })}
            </span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              elapsed <span className="text-foreground/90">{elapsedLabel}</span>
            </span>
          </footer>
        </div>

        <p className="mt-3 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:text-sm">
          quiz-generation · 多Agent协作出题过程中，也可进入其他页面操作。
        </p>
      </div>
    </div>
  );
}
