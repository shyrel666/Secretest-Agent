'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  Copy,
  Download,
  Loader2,
  Trophy,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AgentWorkspaceShell } from '@/components/assessment/agent-workspace-shell';
import { AssessmentCodeBlock } from '@/components/assessment/assessment-code-block';
import { formatAgentElapsed } from '@/lib/format-agent-elapsed';
import { getLanguageLabel } from '@/lib/standards';
import type { LearningTopic } from '@/lib/learning/topics';
import type { AssessmentAnswer, AssessmentQuestion } from '@/lib/store/assessment';
import { cn } from '@/lib/utils';

const AssessmentMarkdownRenderer = dynamic(
  () => import('@/components/assessment/assessment-markdown').then((m) => ({ default: m.AssessmentMarkdownRenderer })),
  { loading: () => <div className="text-sm text-muted-foreground">渲染中...</div> },
);

const difficultyConfig = {
  easy: { label: '简单', color: 'text-green-400', bgColor: 'bg-green-400/10' },
  medium: { label: '中等', color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  hard: { label: '困难', color: 'text-rose-400', bgColor: 'bg-rose-400/10' },
} as const;

const QUIZ_FLOW_STAGES = [
  { key: 'answer', title: '阅读与作答', description: '分析代码片段并选择答案' },
  { key: 'explain', title: '查看解析', description: '基础解析与 Explainer 详细讲解' },
  { key: 'finish', title: '完成测评', description: '提交全部题目并生成学习报告' },
] as const;

export interface QuizSessionWorkspaceProps {
  question: AssessmentQuestion;
  questions: AssessmentQuestion[];
  answers: AssessmentAnswer[];
  currentQuestion: number;
  selectedAnswer: number | null;
  showResult: boolean;
  isReviewingPast: boolean;
  progress: number;
  elapsedMs: number;
  explanation: string;
  isExplaining: boolean;
  showFullExplanation: boolean;
  onShowFullExplanationChange: (open: boolean) => void;
  isExplanationCopied: boolean;
  relatedTopics: LearningTopic[];
  onSelectAnswer: (index: number) => void;
  onNavigateQuestion: (index: number) => void;
  onPrev: () => void;
  onShowResult: () => void;
  onNext: () => void;
  onCopyExplanation: () => void;
  onDownloadExplanation: () => void;
}

function resolveQuizActiveStage(
  showResult: boolean,
  currentQuestion: number,
  total: number,
): (typeof QUIZ_FLOW_STAGES)[number]['key'] {
  if (showResult) return 'explain';
  if (currentQuestion >= total - 1) return 'finish';
  return 'answer';
}

export function QuizSessionWorkspace({
  question,
  questions,
  answers,
  currentQuestion,
  selectedAnswer,
  showResult,
  isReviewingPast,
  progress,
  elapsedMs,
  explanation,
  isExplaining,
  showFullExplanation,
  onShowFullExplanationChange,
  isExplanationCopied,
  relatedTopics,
  onSelectAnswer,
  onNavigateQuestion,
  onPrev,
  onShowResult,
  onNext,
  onCopyExplanation,
  onDownloadExplanation,
}: QuizSessionWorkspaceProps) {
  const activeStageKey = resolveQuizActiveStage(showResult, currentQuestion, questions.length);
  const activeIndex = QUIZ_FLOW_STAGES.findIndex((s) => s.key === activeStageKey);
  const elapsedLabel = formatAgentElapsed(elapsedMs);

  const sidebar = (
    <>
      <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Progress
      </p>
      <ol className="space-y-1.5">
        {QUIZ_FLOW_STAGES.map((stage, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          return (
            <li
              key={stage.key}
              className={cn(
                'rounded-md px-2.5 py-2 text-sm leading-snug',
                state === 'active' && 'bg-primary/10 font-medium text-primary',
                state === 'done' && 'text-foreground',
                state === 'pending' && 'text-muted-foreground',
              )}
            >
              {stage.title}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 border-t border-border/50 pt-4">
        <div className="mb-2.5">
          <Progress value={progress} className="h-1.5" />
          <p className="mt-2 font-mono text-xs text-foreground/80 tabular-nums">
            {currentQuestion + 1} / {questions.length}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {questions.map((_, idx) => {
            const isAnswered = idx < answers.length;
            const isCurrent = idx === currentQuestion;
            const isCorrect = isAnswered && answers[idx].isCorrect;
            const canNav = isAnswered || idx === answers.length;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => canNav && onNavigateQuestion(idx)}
                disabled={!canNav}
                className={cn(
                  'h-8 rounded-md font-mono text-xs font-medium transition-all',
                  isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  isAnswered && isCorrect && 'bg-green-400/20 text-green-400',
                  isAnswered && !isCorrect && 'bg-rose-400/20 text-rose-400',
                  !isAnswered && idx === answers.length && 'bg-muted text-muted-foreground hover:bg-muted/80',
                  !isAnswered && idx !== answers.length && 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {(isExplaining || explanation) && showResult ? (
        <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-2 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1 text-primary">
            <Brain className="h-3 w-3" />
            Explainer
            {isExplaining ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          </span>
        </div>
      ) : null}
    </>
  );

  const statusHint = isReviewingPast
    ? 'review mode'
    : showResult
      ? selectedAnswer === question.correctAnswer
        ? 'correct'
        : 'revealed'
      : 'awaiting answer';

  return (
    <>
      <AgentWorkspaceShell
        layout="viewport"
        sidebarSize="narrow"
        sessionLabel="quiz-session"
        headerBadges={
          <>
            <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-muted-foreground">
              Q{currentQuestion + 1}/{questions.length}
            </span>
            <span className="agent-workspace-timer rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 tabular-nums text-primary">
              {elapsedLabel}
            </span>
            <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 tabular-nums text-foreground/90">
              {Math.round(progress)}%
            </span>
          </>
        }
        sidebar={sidebar}
        mainHeader={{ title: 'Question View', status: statusHint }}
        footer={
          <>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="agent-work-pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
              active
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="text-muted-foreground">
              question <span className="text-foreground/90">{currentQuestion + 1}</span>
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="text-muted-foreground">
              agent <span className="text-primary">Explainer</span>
              {isExplaining ? ' · streaming' : showResult && explanation ? ' · ready' : ' · idle'}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {currentQuestion > 0 ? (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 font-mono text-xs" onClick={onPrev}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  上一题
                </Button>
              ) : null}
              {isReviewingPast ? (
                <Button size="sm" className="h-8 gap-1.5 font-mono text-xs" onClick={onNext}>
                  {currentQuestion < answers.length - 1 ? (
                    <>
                      下一题
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      继续答题
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              ) : !showResult ? (
                <Button
                  size="sm"
                  className="h-8 font-mono text-xs"
                  onClick={onShowResult}
                  disabled={selectedAnswer === null}
                >
                  提交答案
                </Button>
              ) : (
                <Button size="sm" className="h-8 gap-1.5 font-mono text-xs" onClick={onNext}>
                  {currentQuestion < questions.length - 1 ? (
                    <>
                      下一题
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      完成测评
                      <Trophy className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        }
        footerHint={showResult ? 'quiz-session · 可查看解析后继续下一题' : undefined}
      >
        <div
          className={
            showResult
              ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4'
              : 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-2.5 sm:px-6 sm:py-3'
          }
        >
          <div className="mb-2.5 flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-relaxed text-foreground sm:text-base">
              {question.question}
            </h2>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Badge
                className={cn(
                  'h-5 shrink-0 px-2 text-[11px]',
                  difficultyConfig[question.difficulty].bgColor,
                  difficultyConfig[question.difficulty].color,
                )}
              >
                {difficultyConfig[question.difficulty].label}
              </Badge>
              <Badge variant="outline" className="h-5 shrink-0 px-2 text-[11px]">
                {question.language}
              </Badge>
              {question.standardReference ? (
                <Badge
                  variant="secondary"
                  className="h-5 max-w-[min(100%,14rem)] shrink-0 truncate px-2 text-[11px] sm:max-w-[18rem]"
                  title={question.standardReference}
                >
                  {question.standardReference}
                </Badge>
              ) : null}
            </div>
          </div>

          {!showResult ? (
            <div className="flex min-h-0 flex-1 flex-col justify-start gap-2 overflow-y-auto">
              <div className="max-h-[min(50vh,30rem)] shrink-0 overflow-y-auto rounded-lg border border-border/60 bg-muted/20">
                <p className="sticky top-0 z-10 border-b border-border/50 bg-muted/20 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Code
                </p>
                <div className="p-3 sm:p-3.5">
                  <AssessmentCodeBlock code={question.code} language={question.language} size="quiz" />
                </div>
              </div>

              <div className="shrink-0">
                <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Options
                </p>
                <RadioGroup
                  value={selectedAnswer?.toString()}
                  onValueChange={(v) => onSelectAnswer(parseInt(v, 10))}
                  className="grid gap-2 sm:grid-cols-2 sm:gap-2.5"
                >
                  {question.options.map((option, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                        selectedAnswer === index && 'border-primary bg-primary/5',
                        selectedAnswer !== index && 'border-border/60 hover:border-primary/30',
                      )}
                      onClick={() => onSelectAnswer(index)}
                    >
                      <RadioGroupItem
                        value={index.toString()}
                        id={`quiz-option-${index}`}
                        className="mt-1 shrink-0"
                      />
                      <Label
                        htmlFor={`quiz-option-${index}`}
                        className="flex-1 cursor-pointer font-sans text-sm font-normal leading-relaxed text-foreground/85"
                      >
                        <span className="mr-2 font-sans text-xs font-medium tabular-nums text-muted-foreground">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex max-h-[min(42vh,22rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                <p className="shrink-0 border-b border-border/50 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Code
                </p>
                <div className="overflow-y-auto p-3 sm:p-3.5">
                  <AssessmentCodeBlock code={question.code} language={question.language} size="quiz" />
                </div>
              </div>

              <RadioGroup
                value={selectedAnswer?.toString()}
                onValueChange={(v) => onSelectAnswer(parseInt(v, 10))}
                className="mb-4 grid gap-2 sm:grid-cols-2 sm:gap-2.5"
              >
                {question.options.map((option, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-3 py-2',
                      index === question.correctAnswer && 'border-green-400/50 bg-green-400/10',
                      selectedAnswer === index &&
                        index !== question.correctAnswer &&
                        'border-rose-400/50 bg-rose-400/10',
                      selectedAnswer !== index &&
                        index !== question.correctAnswer &&
                        'border-border/50 opacity-80',
                    )}
                  >
                    <RadioGroupItem
                      value={index.toString()}
                      id={`quiz-option-result-${index}`}
                      disabled
                      className="mt-0.5 shrink-0"
                    />
                    <Label
                      htmlFor={`quiz-option-result-${index}`}
                      className="flex-1 font-sans text-xs font-normal leading-relaxed text-foreground/85 sm:text-sm"
                    >
                      <span className="mr-1.5 font-sans text-xs font-medium tabular-nums text-muted-foreground">
                        {String.fromCharCode(65 + index)}.
                      </span>
                      {option}
                    </Label>
                    {index === question.correctAnswer ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
                    ) : null}
                    {selectedAnswer === index && index !== question.correctAnswer ? (
                      <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    ) : null}
                  </div>
                ))}
              </RadioGroup>
            </>
          )}

          {showResult ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    基础解析
                  </span>
                </div>
                <p className="text-sm leading-7 text-foreground/90">{question.explanation}</p>
              </div>

              {(explanation || isExplaining) ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Brain className="h-5 w-5 text-primary" />
                      <span>Explainer 详细讲解</span>
                      {isExplaining ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-mono text-xs"
                      onClick={() => onShowFullExplanationChange(true)}
                    >
                      查看详细讲解
                    </Button>
                  </div>

                  {relatedTopics.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-border/60 bg-background/70 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                        <BookOpen className="h-4 w-4 text-primary" />
                        对应学习章节
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {relatedTopics.map((topic) => (
                          <Link key={topic.id} href={`/learning/${topic.id}`}>
                            <div className="rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/40">
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
              ) : null}
            </div>
          ) : null}
        </div>
      </AgentWorkspaceShell>

      <Dialog open={showFullExplanation} onOpenChange={onShowFullExplanationChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI详细讲解
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 pr-10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={onCopyExplanation}
                  disabled={!explanation}
                >
                  <Copy className="h-4 w-4" />
                  {isExplanationCopied ? '已复制' : '复制讲解'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={onDownloadExplanation}
                  disabled={!explanation}
                >
                  <Download className="h-4 w-4" />
                  导出 Markdown
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-5">
            <AssessmentMarkdownRenderer content={explanation || '正在生成讲解...'} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
