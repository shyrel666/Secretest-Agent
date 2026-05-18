'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import {
  Dumbbell,
  BookOpen,
  Layers,
  RotateCcw,
  Filter,
  CheckCircle,
  XCircle,
  Sparkles,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  Star,
  StarOff,
  Eye,
  Loader2,
  Trophy,
  Target,
  Brain,
  Shuffle,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getModelDisplayName, useAIConfigStore } from '@/lib/store/ai-config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ThemedCodeBlock } from '@/components/ui/themed-code-block';
import { useTokenUsageStore } from '@/lib/store/token-usage';
import { findRelatedLearningTopics } from '@/lib/learning/topics';
import type { QuestionWithStats, QuestionDetail, QuestionBankStats, MasteryStatus } from '@/lib/question-bank/sqlite-store';

import { STANDARD_INFO, type StandardType } from '@/lib/standards';

// ——— 类型 ———

interface CoverageEntry {
  covered: number;
  total: number;
}

interface FilterState {
  language: string;
  vulnerabilityType: string;
  difficulty: string;
  isCorrect: string; // 'all' | 'true' | 'false'
  masteryStatus: string;
}

const INITIAL_FILTERS: FilterState = {
  language: 'all',
  vulnerabilityType: 'all',
  difficulty: 'all',
  isCorrect: 'all',
  masteryStatus: 'all',
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

const MASTERY_LABEL: Record<MasteryStatus, string> = {
  unreviewed: '未复习',
  needs_review: '需复习',
  mastered: '已掌握',
};

const MASTERY_COLOR: Record<MasteryStatus, string> = {
  unreviewed: 'text-muted-foreground',
  needs_review: 'text-amber-400',
  mastered: 'text-green-400',
};

// ——— 工具函数 ———

function buildListUrl(filters: FilterState): string {
  const p = new URLSearchParams({ action: 'list' });
  if (filters.language !== 'all') p.set('language', filters.language);
  if (filters.vulnerabilityType !== 'all') p.set('vulnerabilityType', filters.vulnerabilityType);
  if (filters.difficulty !== 'all') p.set('difficulty', filters.difficulty);
  if (filters.masteryStatus !== 'all') p.set('masteryStatus', filters.masteryStatus);
  if (filters.isCorrect !== 'all') p.set('isCorrect', filters.isCorrect);
  return `/api/question-bank?${p.toString()}`;
}

// ——— 代码高亮组件（复用 assessment 样式） ———

function CodeBlock({ code, language }: { code: string; language: string }) {
  const langMap: Record<string, string> = {
    Java: 'java',
    C: 'c',
    'C++': 'cpp',
    'C#': 'csharp',
  };
  return (
    <ThemedCodeBlock
      language={langMap[language] ?? 'text'}
      customStyle={{ borderRadius: '0.5rem', fontSize: '0.85rem', margin: 0 }}
      showLineNumbers
      code={code}
    />
  );
}

// ——— AI 讲解区域 ———

function AiExplanationSection({
  question,
  prominent,
}: {
  question: QuestionDetail;
  prominent: boolean;
}) {
  const [aiContent, setAiContent] = useState<string>(question.aiExplanation?.content ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptTokens, setPromptTokens] = useState(question.aiExplanation?.promptTokens ?? 0);
  const [completionTokens, setCompletionTokens] = useState(
    question.aiExplanation?.completionTokens ?? 0,
  );
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const hasCache = Boolean(aiContent);

  const handleFetch = useCallback(async () => {
    if (isStreaming) return;
    setOpen(true);
    setIsStreaming(true);
    setAiContent('');

    const { getAgentConfig, getConnectionConfig } = useAIConfigStore.getState();
    const config = getAgentConfig('explainer');
    const connectionConfig = getConnectionConfig();

    try {
      const resp = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: {
            id: question.id,
            code: question.code,
            language: question.language,
            question: question.questionText,
            options: question.options,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            difficulty: question.difficulty,
            vulnerabilityType: question.vulnerabilityType,
            standardReference: question.standardReference,
          },
          userAnswer: question.lastUserAnswer ?? question.correctAnswer,
          isCorrect: question.lastIsCorrect ?? true,
          config,
          connectionConfig,
        }),
      });

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let pTokens = 0;
      let cTokens = 0;

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          const data = JSON.parse(payload);
          if (data.type === 'content' && data.content) {
            fullContent += data.content;
            setAiContent((prev) => prev + data.content);
          } else if (data.type === 'usage' && data.usage) {
            pTokens = data.usage.promptTokens ?? 0;
            cTokens = data.usage.completionTokens ?? 0;
            setPromptTokens(pTokens);
            setCompletionTokens(cTokens);
            addUsageRecord({
              feature: 'explain',
              action: `题库练习 AI 讲解：${question.vulnerabilityType}`,
              modelId: config.model,
              modelLabel: getModelDisplayName(config.model),
              promptTokens: pTokens,
              completionTokens: cTokens,
              totalTokens: pTokens + cTokens,
              estimated: data.usage.estimated ?? false,
            });
          }
        } catch {
          // ignore
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(processLine);
      }
      if (buffer.trim()) processLine(buffer.trim());

      if (fullContent) {
        fetch('/api/question-bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveExplanation',
            questionId: question.id,
            content: fullContent,
            promptTokens: pTokens,
            completionTokens: cTokens,
          }),
        }).catch(console.error);
      }
    } catch (err) {
      console.error('AI 讲解失败', err);
      toast.error('AI 讲解获取失败，请稍后重试');
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, question, addUsageRecord]);

  return (
    <>
      {/* 触发区域：仅按钮，不展示内容 */}
      <div className={cn('mt-4 rounded-xl border p-4 flex items-center justify-between', prominent ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-muted/30')}>
        <div className="flex items-center gap-2">
          <Brain className={cn('w-4 h-4', prominent ? 'text-primary' : 'text-muted-foreground')} />
          <span className={cn('text-sm font-medium', prominent ? 'text-primary' : 'text-muted-foreground')}>
            AI 详细讲解
          </span>
          {hasCache && (
            <Badge variant="outline" className="text-xs text-green-400 border-green-400/40">
              已缓存 · 0 Token
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasCache && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-7 text-xs"
              onClick={() => setOpen(true)}
            >
              <Eye className="w-3.5 h-3.5" />
              查看讲解
            </Button>
          )}
          <Button
            size="sm"
            variant={prominent ? 'default' : 'ghost'}
            className={cn('gap-1.5 h-7 text-xs', !prominent && 'text-muted-foreground')}
            onClick={handleFetch}
            disabled={isStreaming}
          >
            {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hasCache ? '重新生成' : '获取讲解'}
          </Button>
        </div>
      </div>

      {/* 讲解弹窗 */}
      <Dialog open={open} onOpenChange={(v) => { if (!isStreaming) setOpen(v); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0 sm:max-w-4xl lg:max-w-5xl">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI详细讲解
                <Badge variant="outline" className="text-xs font-normal ml-1">{question.vulnerabilityType}</Badge>
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 pr-10">
                {hasCache && !isStreaming && (
                  <Badge variant="outline" className="text-xs font-normal text-green-400 border-green-400/40">
                    已缓存 · 0 Token
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    if (!aiContent) return;
                    navigator.clipboard.writeText(aiContent).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  disabled={!aiContent}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? '已复制' : '复制讲解'}
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-5">
            {isStreaming && !aiContent && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在生成讲解…
              </div>
            )}
            {aiContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none pr-2 [&_h1]:mb-5 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p(props) { return <p className="my-3 leading-8 text-[15px] text-foreground/95" {...props} />; },
                    ul(props) { return <ul className="my-4 list-disc space-y-2 pl-6" {...props} />; },
                    ol(props) { return <ol className="my-4 list-decimal space-y-2 pl-6" {...props} />; },
                    li(props) { return <li className="leading-8" {...props} />; },
                    blockquote(props) { return <blockquote className="my-5 rounded-r-md border-l-4 border-primary/50 bg-muted/30 px-4 py-3 text-foreground/90" {...props} />; },
                    hr(props) { return <hr className="my-6 border-border/60" {...props} />; },
                    table(props) {
                      return (
                        <div className="my-6 overflow-x-auto rounded-lg border border-border/60 bg-muted/10">
                          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-x-4 border-spacing-y-3 text-left" {...props} />
                        </div>
                      );
                    },
                    thead(props) { return <thead className="bg-muted/30" {...props} />; },
                    th(props) { return <th className="px-4 py-3 text-sm font-semibold text-foreground whitespace-normal" {...props} />; },
                    td(props) { return <td className="px-4 py-3 align-top leading-8 text-foreground/90 whitespace-normal break-words" {...props} />; },
                    code({ children, className }: React.ComponentProps<'code'> & { className?: string }) {
                      const content = String(children).replace(/\n$/, '');
                      const langMatch = /language-([\w-]+)/.exec(className || '');
                      const isInline = !className && !content.includes('\n');
                      if (isInline) return <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary">{children}</code>;
                      return (
                        <ThemedCodeBlock
                          language={langMatch?.[1] || 'text'}
                          preTag="div"
                          customStyle={{ margin: 0, borderRadius: '0.5rem', padding: '0.875rem', fontSize: '0.75rem', lineHeight: '1.6', overflowX: 'auto' }}
                          codeTagStyle={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                          code={content}
                        />
                      );
                    },
                  }}
                >
                  {aiContent}
                </ReactMarkdown>
              </div>
            )}
            {isStreaming && aiContent && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成中…
              </div>
            )}
            {!isStreaming && aiContent && (promptTokens > 0 || completionTokens > 0) && (
              <p className="mt-4 text-xs text-muted-foreground border-t border-border/40 pt-3">
                消耗：Prompt {promptTokens} + Completion {completionTokens} tokens
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ——— 题目详情面板 ———

function QuestionDetailPanel({
  questionId,
}: {
  questionId: string;
}) {
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [masteryStatus, setMasteryStatus] = useState<MasteryStatus>('unreviewed');
  const isWrong = detail ? detail.lastIsCorrect === false : false;

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/question-bank?action=detail&id=${questionId}`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        setDetail(data.detail ?? null);
        setMasteryStatus(data.detail?.masteryStatus ?? 'unreviewed');
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void Promise.resolve().then(loadDetail);

    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const handleMastery = async (status: MasteryStatus) => {
    setMasteryStatus(status);
    await fetch('/api/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setMastery', questionId, status }),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) return null;

  const relatedTopics = findRelatedLearningTopics({
    language: detail.language as 'Java' | 'C' | 'C++' | 'C#',
    vulnerabilityType: detail.vulnerabilityType,
    limit: 3,
  });

  return (
    <div className="space-y-5">
      {/* 题目头部信息 */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{detail.language}</Badge>
        <Badge variant="outline">{detail.vulnerabilityType}</Badge>
        <Badge
          variant="outline"
          className={cn(
            detail.difficulty === 'easy'
              ? 'text-green-400 border-green-400/40'
              : detail.difficulty === 'hard'
              ? 'text-rose-400 border-rose-400/40'
              : 'text-amber-400 border-amber-400/40',
          )}
        >
          {DIFFICULTY_LABEL[detail.difficulty] ?? detail.difficulty}
        </Badge>
        {detail.lastIsCorrect !== null && (
          <Badge
            variant="outline"
            className={
              detail.lastIsCorrect
                ? 'text-green-400 border-green-400/40'
                : 'text-rose-400 border-rose-400/40'
            }
          >
            {detail.lastIsCorrect ? '上次答对' : '上次答错'}
          </Badge>
        )}
        <span className={cn('ml-auto text-sm font-medium', MASTERY_COLOR[masteryStatus])}>
          {MASTERY_LABEL[masteryStatus]}
        </span>
      </div>

      {/* 题目文本 */}
      <p className="leading-7">{detail.questionText}</p>

      {/* 代码 */}
      {detail.code && <CodeBlock code={detail.code} language={detail.language} />}

      {/* 选项 */}
      <div className="space-y-2">
        {detail.options.map((opt, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
              idx === detail.correctAnswer
                ? 'border-green-400/40 bg-green-400/10 text-green-300'
                : detail.lastUserAnswer === idx && idx !== detail.correctAnswer
                ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
                : 'border-border/40',
            )}
          >
            <span className="shrink-0 font-mono font-medium">
              {String.fromCharCode(65 + idx)}.
            </span>
            <span>{opt}</span>
            {idx === detail.correctAnswer && (
              <CheckCircle className="ml-auto w-4 h-4 text-green-400 shrink-0" />
            )}
            {detail.lastUserAnswer === idx && idx !== detail.correctAnswer && (
              <XCircle className="ml-auto w-4 h-4 text-rose-400 shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* 基础解析 */}
      <div className={cn('rounded-xl border p-4', isWrong ? 'border-amber-400/20 bg-amber-400/5' : 'border-border/40 bg-muted/20')}>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium">基础解析</span>
          {detail.standardReference && (
            <span className="text-xs text-muted-foreground ml-auto">{detail.standardReference}</span>
          )}
        </div>
        <p className="text-sm leading-7 text-foreground/90">{detail.explanation}</p>
      </div>

      {/* AI 详细讲解 */}
      <AiExplanationSection question={detail} prominent={isWrong} />

      {/* 相关学习章节 */}
      {relatedTopics.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">相关学习章节</span>
          </div>
          <div className="space-y-2">
            {relatedTopics.map((topic) => (
              <Link key={topic.id} href={`/learning/${topic.id}`}>
                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm hover:border-primary/40 transition-colors">
                  <span className="font-medium truncate">{topic.title}</span>
                  <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                    {topic.language}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 掌握状态按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <span className="text-sm text-muted-foreground mr-2">标记状态：</span>
        {(['unreviewed', 'needs_review', 'mastered'] as MasteryStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={masteryStatus === s ? 'default' : 'outline'}
            className="h-7 text-xs gap-1"
            onClick={() => handleMastery(s)}
          >
            {s === 'mastered' ? <Star className="w-3.5 h-3.5" /> : s === 'needs_review' ? <StarOff className="w-3.5 h-3.5" /> : null}
            {MASTERY_LABEL[s]}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ======================================================
// ——— Tab 1: 题库浏览 ———
// ======================================================

function BrowseTab({
  filters,
  setFilters,
  languages,
  vulnTypes,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  languages: string[];
  vulnTypes: string[];
}) {
  const [questions, setQuestions] = useState<QuestionWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(buildListUrl(filters));
      const data = await response.json();
      setQuestions(data.questions ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void Promise.resolve().then(loadQuestions);
  }, [loadQuestions]);

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <BrowseFilters
        filters={filters}
        setFilters={setFilters}
        languages={languages}
        vulnTypes={vulnTypes}
      />

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && questions.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Dumbbell className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>题库暂无数据，完成一次能力测评后题目会自动入库</p>
          <Link href="/assessment" className="mt-4 inline-block">
            <Button variant="outline" className="mt-4 gap-2">
              <Trophy className="w-4 h-4" />
              去能力测评
            </Button>
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {questions.map((q) => (
          <Fragment key={q.id}>
            <Card

            className={cn(
              'transition-colors cursor-pointer hover:border-primary/40',
              q.lastIsCorrect === false && 'border-rose-400/20',
              expandedId === q.id && 'border-primary/40',
            )}
            onClick={() => setExpandedId((prev) => (prev === q.id ? null : q.id))}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {q.lastIsCorrect === true && <CheckCircle className="w-4 h-4 text-green-400" />}
                  {q.lastIsCorrect === false && <XCircle className="w-4 h-4 text-rose-400" />}
                  {q.lastIsCorrect === null && <Eye className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-6 line-clamp-2">{q.questionText}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">{q.language}</Badge>
                    <Badge variant="outline" className="text-xs">{q.vulnerabilityType}</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        q.difficulty === 'easy'
                          ? 'text-green-400 border-green-400/30'
                          : q.difficulty === 'hard'
                          ? 'text-rose-400 border-rose-400/30'
                          : 'text-amber-400 border-amber-400/30',
                      )}
                    >
                      {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                    </Badge>
                    {q.answerCount > 0 && (
                      <span className="text-xs text-muted-foreground">答了 {q.answerCount} 次</span>
                    )}
                    <span className={cn('text-xs ml-auto', MASTERY_COLOR[q.masteryStatus])}>
                      {MASTERY_LABEL[q.masteryStatus]}
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expandedId === q.id && 'rotate-180')} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {expandedId === q.id && (
            <Card className="border-primary/20 bg-muted/10">
              <CardContent className="px-6 py-5">
                <QuestionDetailPanel questionId={q.id} />
              </CardContent>
            </Card>
          )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function BrowseFilters({
  filters,
  setFilters,
  languages,
  vulnTypes,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  languages: string[];
  vulnTypes: string[];
}) {
  return (
    <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
      <Filter className="w-4 h-4 text-muted-foreground self-center" />
      <Select value={filters.language} onValueChange={(v) => setFilters((f) => ({ ...f, language: v }))}>
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue placeholder="语言" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部语言</SelectItem>
          {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.vulnerabilityType} onValueChange={(v) => setFilters((f) => ({ ...f, vulnerabilityType: v }))}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue placeholder="漏洞类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部类型</SelectItem>
          {vulnTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.difficulty} onValueChange={(v) => setFilters((f) => ({ ...f, difficulty: v }))}>
        <SelectTrigger className="h-8 w-[110px] text-xs">
          <SelectValue placeholder="难度" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部难度</SelectItem>
          <SelectItem value="easy">简单</SelectItem>
          <SelectItem value="medium">中等</SelectItem>
          <SelectItem value="hard">困难</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.isCorrect} onValueChange={(v) => setFilters((f) => ({ ...f, isCorrect: v }))}>
        <SelectTrigger className="h-8 w-[110px] text-xs">
          <SelectValue placeholder="状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">对错不限</SelectItem>
          <SelectItem value="true">只看对的</SelectItem>
          <SelectItem value="false">只看错的</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.masteryStatus} onValueChange={(v) => setFilters((f) => ({ ...f, masteryStatus: v }))}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="掌握状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="unreviewed">未复习</SelectItem>
          <SelectItem value="needs_review">需复习</SelectItem>
          <SelectItem value="mastered">已掌握</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ======================================================
// ——— Tab 2: 抽题练习 ———
// ======================================================

type PracticePhase = 'setup' | 'quiz' | 'result';

interface PracticeAnswer {
  question: QuestionWithStats;
  userAnswer: number | null;
  isCorrect: boolean;
}

function PracticeTab({
  languages,
  vulnTypes,
}: {
  languages: string[];
  vulnTypes: string[];
}) {
  const [practicePhase, setPracticePhase] = useState<PracticePhase>('setup');
  const [count, setCount] = useState('10');
  const [lang, setLang] = useState('all');
  const [vuln, setVuln] = useState('all');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [questions, setQuestions] = useState<QuestionWithStats[]>([]);
  const [answers, setAnswers] = useState<PracticeAnswer[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`practice_${Date.now()}`);

  const currentQuestion = questions[currentIdx];

  const handleStart = async () => {
    setLoading(true);
    const p = new URLSearchParams({ action: 'random', count, shuffleOptions: 'true' });
    if (lang !== 'all') p.set('language', lang);
    if (vuln !== 'all') p.set('vulnerabilityType', vuln);
    if (onlyWrong) p.set('onlyWrong', 'true');
    try {
      const data = await fetch(`/api/question-bank?${p.toString()}`).then((r) => r.json());
      if (!data.questions || data.questions.length === 0) {
        toast.error('题库中没有符合条件的题目');
        return;
      }
      setQuestions(data.questions);
      setAnswers([]);
      setCurrentIdx(0);
      setSelectedAnswer(null);
      setShowResult(false);
      sessionId.current = `practice_${Date.now()}`;
      setPracticePhase('quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedAnswer === null || !currentQuestion) return;
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    setShowResult(true);
    setAnswers((prev) => [...prev, { question: currentQuestion, userAnswer: selectedAnswer, isCorrect }]);
    // 异步写回数据库
    fetch('/api/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveAnswer',
        questionId: currentQuestion.id,
        userAnswer: selectedAnswer,
        selectedOptionText: currentQuestion.options[selectedAnswer] ?? null,
        isCorrect,
        sessionId: sessionId.current,
      }),
    }).catch(console.error);
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setPracticePhase('result');
    }
  };

  const handleRestart = () => {
    setPracticePhase('setup');
    setQuestions([]);
    setAnswers([]);
    setCurrentIdx(0);
    setSelectedAnswer(null);
    setShowResult(false);
  };

  // ——— Setup ———
  if (practicePhase === 'setup') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shuffle className="w-5 h-5 text-primary" />
            配置练习
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">题目数量</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} 道</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">编程语言</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部语言</SelectItem>
                  {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">漏洞类型</Label>
              <Select value={vuln} onValueChange={setVuln}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {vulnTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyWrong}
                  onChange={(e) => setOnlyWrong(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">只从错题中抽取</span>
              </label>
            </div>
          </div>
          <Button className="w-full gap-2" onClick={handleStart} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
            开始练习
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ——— Result ———
  if (practicePhase === 'result') {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const score = Math.round((correctCount / answers.length) * 100);
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-6">
          <div className={cn(
            'w-20 h-20 rounded-full mx-auto flex items-center justify-center',
            score >= 60 ? 'bg-green-400/10' : 'bg-rose-400/10',
          )}>
            {score >= 60
              ? <Trophy className="w-10 h-10 text-green-400" />
              : <Target className="w-10 h-10 text-rose-400" />}
          </div>
          <div>
            <div className="text-4xl font-bold mb-1">{score}%</div>
            <p className="text-muted-foreground">
              {correctCount} / {answers.length} 道正确
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <div className="rounded-xl bg-green-400/10 p-3">
              <div className="text-2xl font-bold text-green-400">{correctCount}</div>
              <div className="text-xs text-muted-foreground">正确</div>
            </div>
            <div className="rounded-xl bg-rose-400/10 p-3">
              <div className="text-2xl font-bold text-rose-400">{answers.length - correctCount}</div>
              <div className="text-xs text-muted-foreground">错误</div>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={handleRestart} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              再来一组
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ——— Quiz ———
  if (!currentQuestion) return null;

  return (
    <div className="space-y-4">
      {/* 进度 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{currentIdx + 1} / {questions.length}</span>
        <span>{answers.filter((a) => a.isCorrect).length} 道正确</span>
      </div>
      <Progress value={((currentIdx) / questions.length) * 100} className="h-1.5" />

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* 题目标签 */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{currentQuestion.language}</Badge>
            <Badge variant="outline" className={cn(!showResult && 'text-muted-foreground')}>
              {showResult ? currentQuestion.vulnerabilityType : '漏洞类型待判断'}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                currentQuestion.difficulty === 'easy'
                  ? 'text-green-400 border-green-400/30'
                  : currentQuestion.difficulty === 'hard'
                  ? 'text-rose-400 border-rose-400/30'
                  : 'text-amber-400 border-amber-400/30',
              )}
            >
              {DIFFICULTY_LABEL[currentQuestion.difficulty] ?? currentQuestion.difficulty}
            </Badge>
          </div>

          {/* 题目文字 */}
          <p className="leading-7">{currentQuestion.questionText}</p>

          {/* 代码 */}
          {currentQuestion.code && (
            <CodeBlock code={currentQuestion.code} language={currentQuestion.language} />
          )}

          {/* 选项 */}
          <RadioGroup
            value={selectedAnswer !== null ? String(selectedAnswer) : ''}
            onValueChange={(v) => {
              if (!showResult) setSelectedAnswer(Number(v));
            }}
            className="space-y-2"
          >
            {currentQuestion.options.map((opt, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors',
                  showResult && idx === currentQuestion.correctAnswer
                    ? 'border-green-400/50 bg-green-400/10'
                    : showResult && selectedAnswer === idx && idx !== currentQuestion.correctAnswer
                    ? 'border-rose-400/50 bg-rose-400/10'
                    : selectedAnswer === idx
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/40 hover:border-primary/30',
                )}
                onClick={() => {
                  if (!showResult) setSelectedAnswer(idx);
                }}
              >
                <RadioGroupItem
                  value={String(idx)}
                  id={`opt-${idx}`}
                  className="mt-0.5 shrink-0"
                  disabled={showResult}
                />
                <Label htmlFor={`opt-${idx}`} className="cursor-pointer leading-6 flex-1">
                  <span className="font-mono font-medium mr-2">{String.fromCharCode(65 + idx)}.</span>
                  {opt}
                </Label>
                {showResult && idx === currentQuestion.correctAnswer && (
                  <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                )}
                {showResult && selectedAnswer === idx && idx !== currentQuestion.correctAnswer && (
                  <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                )}
              </div>
            ))}
          </RadioGroup>

          {/* 显示解析（答题后） */}
          {showResult && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium">基础解析</span>
              </div>
              <p className="text-sm leading-7 text-foreground/90">{currentQuestion.explanation}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3">
            {!showResult ? (
              <Button
                onClick={handleConfirm}
                disabled={selectedAnswer === null}
                className="gap-2"
              >
                确认答案
              </Button>
            ) : (
              <Button onClick={handleNext} className="gap-2">
                {currentIdx < questions.length - 1 ? (
                  <>下一题 <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>查看结果 <Trophy className="w-4 h-4" /></>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ======================================================
// ——— Tab 3: 闪卡模式 ———
// ======================================================

function FlashCardTab({
  languages,
  vulnTypes,
}: {
  languages: string[];
  vulnTypes: string[];
}) {
  const [cards, setCards] = useState<QuestionWithStats[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [lang, setLang] = useState('all');
  const [vuln, setVuln] = useState('all');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [masteryMap, setMasteryMap] = useState<Record<string, MasteryStatus>>({});

  const currentCard = cards[currentIdx];

  const handleStart = async () => {
    setLoading(true);
    const p = new URLSearchParams({ action: 'list', shuffleOptions: 'true', randomOrder: 'true' });
    if (lang !== 'all') p.set('language', lang);
    if (vuln !== 'all') p.set('vulnerabilityType', vuln);
    if (onlyWrong) p.set('isCorrect', 'false');
    try {
      const data = await fetch(`/api/question-bank?${p.toString()}`).then((r) => r.json());
      if (!data.questions || data.questions.length === 0) {
        toast.error('题库中没有符合条件的题目');
        return;
      }
      setCards(data.questions);
      const map: Record<string, MasteryStatus> = {};
      for (const q of data.questions) map[q.id] = q.masteryStatus;
      setMasteryMap(map);
      setCurrentIdx(0);
      setFlipped(false);
      setStarted(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMastery = async (status: MasteryStatus) => {
    if (!currentCard) return;
    setMasteryMap((prev) => ({ ...prev, [currentCard.id]: status }));
    await fetch('/api/question-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setMastery', questionId: currentCard.id, status }),
    });
  };

  const goNext = () => {
    if (currentIdx < cards.length - 1) {
      setCurrentIdx((i) => i + 1);
      setFlipped(false);
    }
  };

  const goPrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
      setFlipped(false);
    }
  };

  if (!started) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="w-5 h-5 text-primary" />
            闪卡配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">编程语言</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部语言</SelectItem>
                  {languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">漏洞类型</Label>
              <Select value={vuln} onValueChange={setVuln}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {vulnTypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyWrong}
                  onChange={(e) => setOnlyWrong(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">只看错题</span>
              </label>
            </div>
          </div>
          <Button className="w-full gap-2" onClick={handleStart} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            开始闪卡
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!currentCard) return null;

  const currentMastery = masteryMap[currentCard.id] ?? 'unreviewed';

  return (
    <div className="space-y-4">
      {/* 进度 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{currentIdx + 1} / {cards.length}</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setStarted(false); setCards([]); }}>
          <RotateCcw className="w-3.5 h-3.5" />
          重新配置
        </Button>
      </div>
      <Progress value={((currentIdx + 1) / cards.length) * 100} className="h-1.5" />

      {/* 闪卡 */}
      <div
        className={cn(
          'relative min-h-[400px] rounded-2xl border cursor-pointer select-none transition-colors',
          flipped ? 'border-primary/40 bg-primary/5' : 'border-border/60 hover:border-primary/30',
          currentMastery === 'mastered' && 'opacity-70',
        )}
        onClick={() => setFlipped((v) => !v)}
      >
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{currentCard.language}</Badge>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {flipped ? currentCard.vulnerabilityType : '翻转后查看类型'}
          </Badge>
        </div>

        <div className="p-6 pt-12">
          {!flipped ? (
            /* 正面：题目 */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground font-medium">题目（心中想好答案再翻转）</p>
              <p className="leading-7 text-base">{currentCard.questionText}</p>
              {currentCard.code && (
                <div className="mt-3">
                  <CodeBlock code={currentCard.code} language={currentCard.language} />
                </div>
              )}
            </div>
          ) : (
            /* 背面：答案+解析 */
            <div className="space-y-4">
              <p className="text-sm text-primary font-medium">答案与解析</p>
              <div className="space-y-2">
                {currentCard.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
                      idx === currentCard.correctAnswer
                        ? 'bg-green-400/10 text-green-300 border border-green-400/30'
                        : 'text-muted-foreground',
                    )}
                  >
                    <span className="font-mono font-medium shrink-0">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span>{opt}</span>
                    {idx === currentCard.correctAnswer && (
                      <CheckCircle className="ml-auto w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                <p className="text-sm font-medium text-amber-400 mb-1">基础解析</p>
                <p className="text-sm leading-7 text-foreground/90">{currentCard.explanation}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 掌握状态按钮 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">标记：</span>
        {(['unreviewed', 'needs_review', 'mastered'] as MasteryStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={currentMastery === s ? 'default' : 'outline'}
            className="h-7 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); handleMastery(s); }}
          >
            {s === 'mastered' ? <Star className="w-3.5 h-3.5" /> : s === 'needs_review' ? <StarOff className="w-3.5 h-3.5" /> : null}
            {MASTERY_LABEL[s]}
          </Button>
        ))}
      </div>

      {/* 导航 */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          上一张
        </Button>
        <span className="text-sm text-muted-foreground">{currentIdx + 1} / {cards.length}</span>
        <Button
          variant="outline"
          onClick={goNext}
          disabled={currentIdx === cards.length - 1}
          className="gap-2"
        >
          下一张
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ======================================================
// ——— 主页面 ———
// ======================================================

export default function PracticePage() {
  const [stats, setStats] = useState<QuestionBankStats | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [vulnTypes, setVulnTypes] = useState<string[]>([]);
  const [coverage, setCoverage] = useState<Record<string, CoverageEntry>>({});
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  useEffect(() => {
    fetch('/api/question-bank?action=stats')
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats ?? null);
        setLanguages(data.languages ?? []);
        setVulnTypes(data.vulnTypes ?? []);
        setCoverage(data.coverage ?? {});
      })
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 标题 */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">题库练习</h1>
            <p className="text-sm text-muted-foreground">测评题目自动入库 · 随机练习 · AI讲解缓存</p>
          </div>
          <Link href="/assessment" className="ml-auto">
            <Button variant="outline" size="sm" className="gap-2">
              <Trophy className="w-4 h-4" />
              去能力测评
            </Button>
          </Link>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="题库总数" value={stats.total} icon={<BookOpen className="w-4 h-4" />} />
            <StatCard
              label="错题数"
              value={stats.wrongCount}
              icon={<XCircle className="w-4 h-4" />}
              color="text-rose-400"
            />
            <StatCard
              label="已掌握"
              value={stats.masteredCount}
              icon={<Star className="w-4 h-4" />}
              color="text-green-400"
            />
            <StatCard
              label="AI讲解缓存"
              value={stats.aiExplanationCount}
              icon={<Brain className="w-4 h-4" />}
              color="text-primary"
            />
          </div>
        )}

        {/* 漏洞类型覆盖率 */}
        {Object.keys(coverage).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                漏洞类型覆盖率
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.entries(coverage) as [string, CoverageEntry][]).map(([stdType, entry]) => {
                const info = STANDARD_INFO[stdType as StandardType];
                if (!info) return null;
                const pct = entry.total > 0 ? Math.round((entry.covered / entry.total) * 100) : 0;
                return (
                  <div key={stdType} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className={cn('font-medium', info.accentTextClassName)}>{info.shortLabel}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {entry.covered}/{entry.total} 种 ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Tab 内容 */}
        <Tabs defaultValue="browse">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="browse" className="gap-2">
              <BookOpen className="w-4 h-4" />
              题库浏览
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-2">
              <Shuffle className="w-4 h-4" />
              抽题练习
            </TabsTrigger>
            <TabsTrigger value="flashcard" className="gap-2">
              <Layers className="w-4 h-4" />
              闪卡模式
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-4">
            <BrowseTab
              filters={filters}
              setFilters={setFilters}
              languages={languages}
              vulnTypes={vulnTypes}
            />
          </TabsContent>

          <TabsContent value="practice" className="mt-4">
            <PracticeTab languages={languages} vulnTypes={vulnTypes} />
          </TabsContent>

          <TabsContent value="flashcard" className="mt-4">
            <FlashCardTab languages={languages} vulnTypes={vulnTypes} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = 'text-foreground',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/30 p-4">
      <div className={cn('flex items-center gap-2 mb-2 text-muted-foreground', color)}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
    </div>
  );
}
