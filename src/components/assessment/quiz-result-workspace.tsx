'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Brain,
  CheckCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AgentWorkspaceShell } from '@/components/assessment/agent-workspace-shell';
import { getLanguageLabel } from '@/lib/standards';
import type { LearningTopic } from '@/lib/learning/topics';
import type {
  AssessmentAnswer,
  AssessmentLearningReport,
} from '@/lib/store/assessment';
import { cn } from '@/lib/utils';

const REPORT_FLOW_STAGES = [
  { key: 'score', title: '成绩汇总', description: '得分、正确率与通过判定' },
  { key: 'report', title: 'Agent 学习报告', description: 'Explainer 分析薄弱点与学习路径' },
  { key: 'review', title: '答题回顾', description: '逐题回顾并跳转相关章节' },
] as const;

function LearningPathList({
  title,
  items,
  fallback,
}: {
  title: string;
  items: string[];
  fallback: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-2 text-sm font-medium text-foreground">{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="text-sm leading-6 text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">{fallback}</p>
      )}
    </div>
  );
}

export interface QuizResultWorkspaceProps {
  answers: AssessmentAnswer[];
  score: number;
  passed: boolean;
  correctCount: number;
  learningReportStatus: 'idle' | 'loading' | 'success' | 'error';
  learningReportError: string;
  learningReport: AssessmentLearningReport | null;
  weakTopics: LearningTopic[];
  onRestart: () => void;
}

function resolveReportActiveStage(
  learningReportStatus: QuizResultWorkspaceProps['learningReportStatus'],
): (typeof REPORT_FLOW_STAGES)[number]['key'] {
  if (learningReportStatus === 'loading') return 'report';
  if (learningReportStatus === 'success' || learningReportStatus === 'error') return 'review';
  return 'score';
}

export function QuizResultWorkspace({
  answers,
  score,
  passed,
  correctCount,
  learningReportStatus,
  learningReportError,
  learningReport,
  weakTopics,
  onRestart,
}: QuizResultWorkspaceProps) {
  const activeStageKey = resolveReportActiveStage(learningReportStatus);
  const activeIndex = REPORT_FLOW_STAGES.findIndex((s) => s.key === activeStageKey);
  const learningPath = learningReport?.learningPath;

  const sidebar = (
    <>
      <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Report Pipeline
      </p>
      <ol className="space-y-0">
        {REPORT_FLOW_STAGES.map((stage, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          return (
            <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
              {index < REPORT_FLOW_STAGES.length - 1 ? (
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
                    {stage.key === 'report' && learningReportStatus === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary sm:h-5 sm:w-5" />
                    ) : passed ? (
                      <Award className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    ) : (
                      <Target className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    )}
                  </div>
                ) : (
                  <span className="block h-7 w-7 rounded-full border-2 border-muted-foreground/30 sm:h-8 sm:w-8" />
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
                  {stage.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  {stage.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 space-y-3 rounded-xl border border-border/50 bg-background/40 p-4">
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>score</span>
          <span className="text-lg font-semibold text-primary tabular-nums">{score}%</span>
        </div>
        <Progress value={score} className="h-2" />
        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="rounded-lg bg-green-400/10 px-2 py-1.5 text-green-400">
            ✓ {correctCount}
          </div>
          <div className="rounded-lg bg-rose-400/10 px-2 py-1.5 text-rose-400">
            ✗ {answers.length - correctCount}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <AgentWorkspaceShell
      layout="viewport"
      sidebarSize="narrow"
      sessionLabel="quiz-report"
      headerBadges={
        <>
          <span
            className={cn(
              'rounded-lg border px-3 py-1.5',
              passed
                ? 'border-green-400/30 bg-green-400/10 text-green-400'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-400',
            )}
          >
            {passed ? 'passed' : 'retry'}
          </span>
          <span className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 tabular-nums text-primary">
            {score}%
          </span>
        </>
      }
      sidebar={sidebar}
      mainHeader={{
        title: 'Session Report',
        status: learningReportStatus === 'loading' ? 'generating' : 'complete',
      }}
      footer={
        <>
          <span className="text-muted-foreground">
            result <span className="text-foreground/90">{passed ? 'passed' : 'failed'}</span>
          </span>
          <span className="hidden text-border sm:inline" aria-hidden="true">
            |
          </span>
          <span className="text-muted-foreground">
            agent <span className="text-primary">Explainer</span>
            {learningReportStatus === 'loading' ? ' · streaming' : ' · done'}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" className="h-8 gap-1.5 font-mono text-xs" onClick={onRestart}>
              <RotateCcw className="h-3.5 w-3.5" />
              重新测试
            </Button>
            <Link href="/practice">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 font-mono text-xs">
                <Brain className="h-3.5 w-3.5" />
                题库练习
              </Button>
            </Link>
            <Link href="/learning">
              <Button variant="outline" size="sm" className="h-8 font-mono text-xs">
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                学习中心
              </Button>
            </Link>
          </div>
        </>
      }
      footerHint="quiz-report · 测评已结束，学习报告与章节建议可供复习"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="mb-6 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
          <div
            className={cn(
              'mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-full sm:mb-0 sm:mr-5',
              passed ? 'bg-green-400/10' : 'bg-rose-400/10',
            )}
          >
            {passed ? (
              <Award className="h-8 w-8 text-green-400" />
            ) : (
              <Target className="h-8 w-8 text-rose-400" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{passed ? '恭喜通过！' : '继续努力！'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {passed
                ? '你已具备良好的代码安全审计能力'
                : '建议继续学习后再次挑战'}
            </p>
          </div>
        </div>

        {learningReportStatus !== 'idle' ? (
          <div className="mb-6 rounded-2xl border border-border/60 bg-background/70 p-5">
            <div className="mb-4 flex items-center gap-2">
              {learningReportStatus === 'loading' ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : learningReportStatus === 'error' ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
              <h3 className="font-semibold">Agent 学习报告</h3>
            </div>

            {learningReportStatus === 'loading' && (
              <p className="font-mono text-sm leading-6 text-muted-foreground">
                <span className="text-primary/60">$</span> explainer.generateReport() — streaming…
              </p>
            )}

            {learningReportStatus === 'error' && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="text-sm font-medium text-amber-300">学习报告暂时不可用</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {learningReportError || '本次测评结果已保留，可继续查看答题回顾和本地学习建议。'}
                </p>
              </div>
            )}

            {learningReportStatus === 'success' && learningPath ? (
              <div className="grid gap-3 md:grid-cols-2">
                <LearningPathList
                  title="掌握较好"
                  items={learningPath.strengths}
                  fallback="本次报告暂未识别出明确优势。"
                />
                <LearningPathList
                  title="薄弱点"
                  items={learningPath.weaknesses}
                  fallback="本次报告暂未识别出明确薄弱点。"
                />
                <LearningPathList
                  title="学习建议"
                  items={learningPath.recommendations}
                  fallback="暂无额外学习建议。"
                />
                <LearningPathList
                  title="下一步主题"
                  items={learningPath.nextTopics}
                  fallback="暂无下一步主题建议。"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-6">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            答题回顾
          </h3>
          <div className="space-y-2">
            {answers.map((answer, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2.5',
                  answer.isCorrect ? 'bg-green-400/10' : 'bg-rose-400/10',
                )}
              >
                <div className="flex items-center gap-3">
                  {answer.isCorrect ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                  <span className="text-sm">
                    第{i + 1}题：{answer.question.vulnerabilityType}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {answer.question.language}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {weakTopics.length > 0 ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">建议优先回到这些章节继续学</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {weakTopics.map((topic) => (
                <Link key={topic.id} href={`/learning/${topic.id}`}>
                  <div className="rounded-xl border border-border/60 bg-background/70 p-4 transition-colors hover:border-primary/40">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary">{getLanguageLabel(topic.language)}</Badge>
                      <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
                    </div>
                    <div className="font-medium">{topic.title}</div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AgentWorkspaceShell>
  );
}
