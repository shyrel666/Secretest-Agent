'use client';

import { BookOpen, Circle, Sparkles, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STANDARD_INFO, getLanguageLabel, type AssessmentLanguage } from '@/lib/standards';
import { cn } from '@/lib/utils';

interface FlowStage {
  key: string;
  title: string;
  description: string;
}

interface AssessmentSetupWorkspaceProps {
  flowStages: readonly FlowStage[];
  language: AssessmentLanguage;
  totalQuestions: number;
  onLanguageChange: (language: AssessmentLanguage) => void;
  onQuestionCountChange: (count: number) => void;
  onGenerate: () => void;
  hasJavaKnowledge: boolean;
  hasCppKnowledge: boolean;
  hasCsharpKnowledge: boolean;
  hasMixedKnowledge: boolean;
  availableKnowledgeCount: number;
  focusTopicTitle?: string;
  focusVulnerabilityType?: string;
}

const LANGUAGE_OPTIONS: Array<{
  value: AssessmentLanguage;
  label: string;
  getDesc: (props: Pick<AssessmentSetupWorkspaceProps, 'hasJavaKnowledge' | 'hasCppKnowledge' | 'hasCsharpKnowledge' | 'hasMixedKnowledge' | 'availableKnowledgeCount'>) => string;
  isDisabled: (props: Pick<AssessmentSetupWorkspaceProps, 'hasJavaKnowledge' | 'hasCppKnowledge' | 'hasCsharpKnowledge' | 'hasMixedKnowledge'>) => boolean;
}> = [
  {
    value: 'java',
    label: 'Java',
    getDesc: ({ hasJavaKnowledge }) => (hasJavaKnowledge ? STANDARD_INFO.java.name : '未上传 Java 标准'),
    isDisabled: ({ hasJavaKnowledge }) => !hasJavaKnowledge,
  },
  {
    value: 'cpp',
    label: 'C/C++',
    getDesc: ({ hasCppKnowledge }) => (hasCppKnowledge ? STANDARD_INFO.cpp.name : '未上传 C/C++ 标准'),
    isDisabled: ({ hasCppKnowledge }) => !hasCppKnowledge,
  },
  {
    value: 'csharp',
    label: 'C#',
    getDesc: ({ hasCsharpKnowledge }) => (hasCsharpKnowledge ? STANDARD_INFO.csharp.name : '未上传 C# 标准'),
    isDisabled: ({ hasCsharpKnowledge }) => !hasCsharpKnowledge,
  },
  {
    value: 'mixed',
    label: '混合',
    getDesc: ({ hasMixedKnowledge, availableKnowledgeCount }) =>
      hasMixedKnowledge ? `已启用 ${availableKnowledgeCount} 类标准` : '需至少上传两类标准',
    isDisabled: ({ hasMixedKnowledge }) => !hasMixedKnowledge,
  },
];

const QUESTION_COUNTS = [3, 5, 8, 10] as const;

export function AssessmentSetupWorkspace({
  flowStages,
  language,
  totalQuestions,
  onLanguageChange,
  onQuestionCountChange,
  onGenerate,
  hasJavaKnowledge,
  hasCppKnowledge,
  hasCsharpKnowledge,
  hasMixedKnowledge,
  availableKnowledgeCount,
  focusTopicTitle,
  focusVulnerabilityType,
}: AssessmentSetupWorkspaceProps) {
  const knowledgeProps = {
    hasJavaKnowledge,
    hasCppKnowledge,
    hasCsharpKnowledge,
    hasMixedKnowledge,
    availableKnowledgeCount,
  };

  const canGenerate = availableKnowledgeCount > 0;

  return (
    <div className="agent-workspace flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-[min(76rem,calc(100vw-4rem))] flex-col">
        <div className="agent-workspace-panel flex h-[min(720px,calc(100dvh-11rem))] max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl">
          <header className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-muted/25 px-5 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-500/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-500/80 sm:h-4 sm:w-4" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 font-mono text-sm text-muted-foreground sm:text-base">
              <Terminal className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="truncate">
                secretest-agent — <span className="text-foreground/90">quiz-setup</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 font-mono text-sm sm:text-base">
              <span className="rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-muted-foreground">
                {getLanguageLabel(language)} · {totalQuestions} 题
              </span>
              <span className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-1.5 text-primary">
                ready
              </span>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(260px,20rem)_1fr]">
            <aside className="border-b border-border/60 bg-muted/15 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
              <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Pipeline Preview
              </p>
              <ol className="space-y-0">
                {flowStages.map((flowStage, index) => (
                  <li key={flowStage.key} className="relative flex gap-4 pb-6 last:pb-0">
                    {index < flowStages.length - 1 ? (
                      <span
                        className="absolute left-[13px] top-8 h-[calc(100%-14px)] w-px bg-border/70 sm:left-[15px]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative z-10 mt-0.5 shrink-0">
                      <Circle className="h-7 w-7 text-muted-foreground/35 sm:h-8 sm:w-8" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-base font-medium leading-snug text-muted-foreground sm:text-lg">
                        {flowStage.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground/80 sm:text-[15px]">
                        {flowStage.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-8 rounded-xl border border-border/50 bg-background/40 p-4 font-mono text-xs leading-relaxed text-muted-foreground sm:p-5 sm:text-sm">
                <p>
                  <span className="text-primary/70">$</span> agents.list()
                </p>
                <p className="mt-2 text-foreground/80">Knowledge · QuestionGen · Reviewer</p>
                <p className="mt-3">
                  <span className="text-primary/70">$</span> await user.config()
                </p>
              </div>
            </aside>

            <section className="flex min-h-0 flex-1 flex-col bg-background/30">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-3 sm:px-7 sm:py-3.5">
                <span className="font-mono text-sm font-medium text-foreground sm:text-base">Session Config</span>
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground sm:text-sm">
                  idle
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4 sm:px-7 sm:py-5">
                <div className="mb-4">
                  <p className="mb-1 font-mono text-xs uppercase tracking-wider text-primary">config.language</p>
                  <h2 className="text-xl font-semibold text-foreground sm:text-2xl">选择语言标准</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    基于知识库内容，由多 Agent 协作出题
                  </p>
                </div>

                {focusTopicTitle ? (
                  <div className="mb-5 rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 font-mono text-sm text-primary">
                    <span className="text-primary/70">focus </span>
                    {focusTopicTitle}
                    {focusVulnerabilityType ? ` · ${focusVulnerabilityType}` : ''}
                  </div>
                ) : null}

                <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {LANGUAGE_OPTIONS.map((option) => {
                    const disabled = option.isDisabled(knowledgeProps);
                    const selected = language === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onLanguageChange(option.value)}
                        disabled={disabled}
                        className={cn(
                          'rounded-lg border px-3 py-3 text-left transition-all sm:py-4',
                          selected
                            ? 'border-primary bg-primary/10 shadow-md shadow-primary/10'
                            : 'border-border/70 bg-background/40 hover:border-primary/40',
                          disabled && 'cursor-not-allowed opacity-45 hover:border-border/70',
                        )}
                      >
                        <div className="font-mono text-sm font-semibold text-foreground sm:text-base">
                          {option.label}
                        </div>
                        <div className="mt-1 text-xs leading-snug text-muted-foreground">
                          {option.getDesc(knowledgeProps)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {availableKnowledgeCount === 0 ? (
                  <p className="mb-4 font-mono text-xs text-amber-400 sm:text-sm">
                    warn: 当前尚未上传任何标准文档，无法生成测评题
                  </p>
                ) : null}

                <div className="mb-4">
                  <p className="mb-2 font-mono text-xs uppercase tracking-wider text-primary">config.count</p>
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => onQuestionCountChange(count)}
                        className={cn(
                          'rounded-lg border px-4 py-2 font-mono text-sm transition-all sm:px-5 sm:py-2.5 sm:text-base',
                          totalQuestions === count
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/70 bg-background/40 text-foreground hover:border-primary/40',
                        )}
                      >
                        {count} 题
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 sm:p-4">
                  <div className="flex gap-3">
                    <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">notes</p>
                      <ul className="mt-1.5 space-y-1 text-sm leading-snug text-muted-foreground">
                        <li>
                          <span className="text-primary/60">›</span> AI 基于知识库检索并生成题目
                        </li>
                        <li>
                          <span className="text-primary/60">›</span> QuestionGen 出题 · Reviewer 审核质量
                        </li>
                        <li>
                          <span className="text-primary/60">›</span> 答错后可获得讲解与学习路径建议
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50 px-5 py-4 sm:px-7 sm:py-5">
                <Button
                  size="lg"
                  className="h-12 w-full gap-2 font-mono text-base sm:h-14"
                  onClick={onGenerate}
                  disabled={!canGenerate}
                >
                  <Sparkles className="h-4 w-4" />
                  开始生成题目
                </Button>
              </div>
            </section>
          </div>

          <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 bg-muted/20 px-5 py-3 font-mono text-xs sm:px-7 sm:py-3.5 sm:text-sm">
            <span className="text-muted-foreground">idle</span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="text-muted-foreground">
              next <span className="text-foreground/90">quiz-generation</span>
            </span>
            <span className="hidden text-border sm:inline" aria-hidden="true">
              |
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground/60">
              {['Orchestrator', 'Knowledge', 'QuestionGen', 'Reviewer'].map((name) => (
                <span key={name} className="rounded border border-transparent px-1.5 py-0.5">
                  {name}
                </span>
              ))}
            </span>
            <span className="ml-auto text-muted-foreground">
              点击 <span className="text-primary">开始生成题目</span> 启动
            </span>
          </footer>
        </div>

        <p className="mt-3 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:text-sm">
          配置完成后将进入 Agent 出题工作区
        </p>
      </div>
    </div>
  );
}
