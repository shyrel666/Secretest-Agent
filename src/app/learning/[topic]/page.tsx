'use client';

import Link from 'next/link';
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import type { TokenUsage } from '@/lib/token-usage';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, Loader2, Sparkles, Target } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemedCodeBlock } from '@/components/ui/themed-code-block';
import { Progress } from '@/components/ui/progress';
import { type LessonDocument } from '@/lib/learning/lesson-document';
import { type DynamicLearningTopic, getLearningTopic } from '@/lib/learning/topics';
import { getModelDisplayName, useAIConfigStore } from '@/lib/store/ai-config';
import { useLearningProgressStore } from '@/lib/store/learning-progress';
import { getLanguageLabel } from '@/lib/standards';
import { hasTokenUsage } from '@/lib/token-usage';
import { useTokenUsageStore } from '@/lib/store/token-usage';

interface LessonSection {
  id: string;
  title: string;
}

interface LessonStreamPayload {
  lessonDocument?: LessonDocument;
  references?: string[];
  usage?: TokenUsage | null;
  content?: string;
}

interface LessonStageState {
  label: string;
  detail: string;
  progress: number;
}

function isModelConfigError(message: string): boolean {
  return /api key|模型服务认证失败|模型接口地址|authorization|authentication|401/i.test(message);
}

const TOP_LEVEL_LESSON_SECTIONS = [
  { index: 1, title: '本章你会学到什么' },
  { index: 2, title: '先建立直觉' },
  { index: 3, title: '漏洞是怎么形成的' },
  { index: 4, title: '审计时先看什么' },
  { index: 5, title: '一个贴近业务的小例子' },
  { index: 6, title: '学完后立刻自测' },
] as const;

const TOP_LEVEL_LESSON_SECTION_PATTERNS = [
  /^本章你会学到什么[：:？?]?$/,
  /^先建立直觉[：:？?]?$/,
  /^漏洞是怎么形成的[：:？?]?$/,
  /^审计时先看什么[：:？?]?$/,
  /^一个贴近业务的小例子[：:？?]?$/,
  /^学完后立刻自测[：:？?]?$/,
];

export default function LearningTopicPage() {
  const params = useParams<{ topic: string }>();
  const topicId = Array.isArray(params?.topic) ? params.topic[0] : params?.topic;

  // 优先从 API 加载动态 topic，回退到硬编码
  const [topic, setTopic] = useState<DynamicLearningTopic | undefined>(undefined);
  const [isLoadingTopic, setIsLoadingTopic] = useState(true);

  useEffect(() => {
    if (!topicId) { setIsLoadingTopic(false); return; }
    let cancelled = false;

    const loadTopic = async () => {
      try {
        const res = await fetch('/api/learning/topics', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data.success) {
          const found = (data.topics as DynamicLearningTopic[]).find((t) => t.id === topicId);
          if (found) { setTopic(found); setIsLoadingTopic(false); return; }
        }
      } catch { /* ignore */ }

      // 回退到硬编码 topic
      if (!cancelled) {
        const fallback = getLearningTopic(topicId);
        if (fallback) {
          setTopic({
            ...fallback,
            clausePrefix: '',
            docId: '',
            subClauses: [],
            fromDocument: false,
            contentSource: 'fallback',
            topicGroup: 'core',
          });
        }
        setIsLoadingTopic(false);
      }
    };

    loadTopic();
    return () => { cancelled = true; };
  }, [topicId]);

  const [lessonDocument, setLessonDocument] = useState<LessonDocument | null>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [isLoadingLesson, setIsLoadingLesson] = useState(false);
  const [error, setError] = useState('');
  const [, setLessonUsage] = useState<TokenUsage | null>(null);
  const [lessonStage, setLessonStage] = useState<LessonStageState | null>(null);

  const { getAgentConfig, getConnectionConfig } = useAIConfigStore();
  const topicProgress = useLearningProgressStore((state) => (topicId ? state.topics[topicId] : undefined));
  const markTopicStarted = useLearningProgressStore((state) => state.markTopicStarted);
  const markTopicCompleted = useLearningProgressStore((state) => state.markTopicCompleted);
  const cacheLesson = useLearningProgressStore((state) => state.cacheLesson);
  const addUsageRecord = useTokenUsageStore((state) => state.addRecord);
  const formattedLesson = useMemo(
    () => formatLessonContent(lessonDocument?.contentMarkdown || '', topic?.title || ''),
    [lessonDocument?.contentMarkdown, topic?.title],
  );
  const lessonSections = useMemo(() => {
    const sections = extractLessonSections(formattedLesson);
    if (sections.length > 0 && lessonDocument && lessonDocument.practiceQuestions.length > 0) {
      const selfTestTitle = '6. 学完后立刻自测';
      sections.push({ id: slugify(selfTestTitle), title: selfTestTitle });
    }
    return sections;
  }, [formattedLesson, lessonDocument]);
  const practiceQuestions = useMemo(
    () => lessonDocument?.practiceQuestions.map((question) => ({
      questionMarkdown: normalizeLessonMarkdown(question.questionMarkdown),
      answerMarkdown: normalizeLessonMarkdown(question.answerMarkdown),
    })) || [],
    [lessonDocument],
  );
  const markdownComponents = useMemo(() => ({
    h1(props: React.ComponentProps<'h1'>) {
      const title = extractText(props.children);
      return <h1 id={slugify(title)} className="mb-5 text-3xl font-bold tracking-tight" {...props} />;
    },
    h2(props: React.ComponentProps<'h2'>) {
      const title = extractText(props.children);
      return <h2 id={slugify(title)} className="mt-10 mb-4 scroll-mt-24 border-t border-border/60 pt-8 text-2xl font-semibold tracking-tight" {...props} />;
    },
    h3(props: React.ComponentProps<'h3'>) {
      const title = extractText(props.children);
      return <h3 id={slugify(title)} className="mt-8 mb-3 scroll-mt-24 text-xl font-semibold" {...props} />;
    },
    blockquote(props: React.ComponentProps<'blockquote'>) {
      return <blockquote className="my-6 rounded-r-lg border-l-4 border-primary/50 bg-muted/30 px-4 py-3 text-foreground/90" {...props} />;
    },
    table(props: React.ComponentProps<'table'>) {
      return (
        <div className="my-6 overflow-x-auto rounded-xl border border-border/60 bg-muted/10">
          <table className="w-full min-w-[720px] border-separate border-spacing-0" {...props} />
        </div>
      );
    },
    thead(props: React.ComponentProps<'thead'>) {
      return <thead className="bg-muted/40" {...props} />;
    },
    th(props: React.ComponentProps<'th'>) {
      return <th className="border-b border-border/60 px-4 py-3 text-left text-sm font-semibold text-foreground" {...props} />;
    },
    td(props: React.ComponentProps<'td'>) {
      return <td className="border-b border-border/40 px-4 py-3 align-top leading-8 text-foreground/90" {...props} />;
    },
    code(props: React.ComponentProps<'code'>) {
      const { children, className } = props;
      const content = String(children).replace(/\n$/, '');
      const languageMatch = /language-([\w-]+)/.exec(className || '');
      const isInline = !className && !content.includes('\n');

      if (isInline) {
        return <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-primary whitespace-pre-wrap break-words">{children}</code>;
      }

      return (
        <ThemedCodeBlock
          language={languageMatch?.[1] || 'text'}
          preTag="div"
          customStyle={{
            margin: 0,
            borderRadius: '0.75rem',
            padding: '1rem',
            fontSize: '0.8rem',
            lineHeight: '1.7',
            overflowX: 'auto',
          }}
          code={content}
        />
      );
    },
  }), []);
  const errorAction = useMemo(() => {
    if (isModelConfigError(error)) {
      return {
        href: '/settings',
        label: '去检查系统设置',
      };
    }

    return {
      href: '/knowledge',
      label: '去检查知识库文档',
    };
  }, [error]);

  useEffect(() => {
    if (!topicId) return;
    markTopicStarted(topicId);
  }, [markTopicStarted, topicId]);

  useEffect(() => {
    if (!topicId || !topic || isLoadingTopic) return;

    if (topicProgress?.lessonDocument) {
      setLessonDocument(topicProgress.lessonDocument);
      return;
    }

    let cancelled = false;

    const loadLesson = async () => {
      setIsLoadingLesson(true);
      setError('');
      setLessonDocument(null);
      setReferences([]);
      setLessonUsage(null);
      setLessonStage({
        label: '准备生成',
        detail: '正在连接知识库并准备章节导学…',
        progress: 6,
      });

      try {
        const response = await fetch('/api/learning/lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: topic.id,
            clausePrefix: topic.clausePrefix || undefined,
            docId: topic.docId || undefined,
            config: getAgentConfig('explainer'),
            connectionConfig: getConnectionConfig(),
            stream: true,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || '章节内容加载失败');
        }

        if (!response.body) {
          throw new Error('章节内容加载失败');
        }

        let recordedUsage = false;
        const applyLessonContent = (content: string) => {
          if (cancelled) {
            return;
          }

          setLessonDocument((previous) => ({
            contentMarkdown: content,
            practiceQuestions: previous?.practiceQuestions || [],
          }));
        };

        const applyLessonPayload = (payload: LessonStreamPayload) => {
          if (cancelled) {
            return;
          }

          const nextLessonDocument = payload.lessonDocument || null;
          setLessonDocument(nextLessonDocument);
          setReferences(Array.isArray(payload.references) ? payload.references : []);
          setLessonUsage(payload.usage || null);

          if (nextLessonDocument) {
            cacheLesson(topic.id, nextLessonDocument);
          }

          if (!recordedUsage && payload.usage && hasTokenUsage(payload.usage)) {
            recordedUsage = true;
            addUsageRecord({
              feature: 'learning',
              action: `生成章节：${topic.title}`,
              modelId: getAgentConfig('explainer').model,
              modelLabel: getModelDisplayName(getAgentConfig('explainer').model),
              ...payload.usage,
            });
          }

          setLessonStage(null);
        };

        await readSseStream(response, {
          onStage: (stage) => {
            if (!cancelled) {
              setLessonStage(stage);
            }
          },
          onContent: (payload) => {
            if (payload.content) {
              applyLessonContent(payload.content);
            }
          },
          onMetadata: (payload) => {
            applyLessonPayload({
              lessonDocument: payload.lessonDocument,
              references: payload.references,
              usage: payload.usage,
            });
          },
          onResult: (payload) => {
            applyLessonPayload({
              lessonDocument: payload.lessonDocument,
              references: payload.references,
              usage: payload.usage,
            });
          },
          onError: (message) => {
            throw new Error(message);
          },
        });
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : '章节内容加载失败');
          setLessonStage(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLesson(false);
        }
      }
    };

    loadLesson();

    return () => {
      cancelled = true;
    };
  }, [addUsageRecord, cacheLesson, getAgentConfig, getConnectionConfig, isLoadingTopic, topic, topicId, topicProgress?.lessonDocument]);

  if (isLoadingTopic) {
    return (
      <div className="min-h-screen py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              正在加载章节信息...
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="space-y-4 py-12 text-center">
              <div className="text-xl font-semibold">章节不存在</div>
              <Button asChild variant="outline">
                <Link href="/learning">返回学习中心</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit justify-start text-muted-foreground hover:text-foreground">
            <Link href="/learning">
              <ArrowLeft className="h-4 w-4" />
              返回学习中心
            </Link>
          </Button>
          <Badge variant="outline">{topic.standard}</Badge>
        </div>

        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{getLanguageLabel(topic.language)}</Badge>
              <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
              {topicProgress?.completedAt && <Badge className="bg-emerald-500/15 text-emerald-300">已完成</Badge>}
            </div>
            <div className="space-y-3">
              <CardTitle className="text-3xl">{topic.title}</CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {topic.summary}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-primary" />
                本章目标
              </div>
              <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                {topic.goals.map((goal) => (
                  <li key={goal} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{goal}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>本章进度</span>
                  <span>{topicProgress?.completionRate || 0}%</span>
                </div>
                <Progress value={topicProgress?.completionRate || 0} className="h-2" />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-primary" />
                学完这一章后
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                建议立即去做同主题练习，把“概念理解”转成“代码判断”。如果你答错了，再回到本章复盘，会更容易形成真正的审计直觉。
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="button" onClick={() => markTopicCompleted(topic.id)} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  标记本章已完成
                </Button>
                <Link href={`/assessment?language=${topic.language}&focus=${encodeURIComponent(topic.vulnerabilityFocus)}&topicTitle=${encodeURIComponent(topic.title)}`}>
                  <Button variant="outline" className="gap-2">
                    去做本章练习
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_260px]">
          <Card>
            <CardHeader>
              <CardTitle>章节导学</CardTitle>
              <CardDescription>把这一章当成一次长文阅读。先看直觉和形成原理，再回到右侧行动区做练习。</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLesson && !lessonDocument ? (
                <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {lessonStage?.detail || '正在基于知识库生成章节导学...'}
                </div>
              ) : error ? (
                <div className="space-y-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5">
                  <div className="font-medium text-rose-200">章节导学生成失败</div>
                  <p className="text-sm leading-7 text-rose-100/80">{error}</p>
                  <Link href={errorAction.href}>
                    <Button variant="outline">{errorAction.label}</Button>
                  </Link>
                </div>
              ) : (
                <article className="mx-auto max-w-5xl xl:px-4">
                  {isLoadingLesson && lessonStage && (
                    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        {lessonStage.label}
                      </div>
                      <p className="mb-3 text-sm leading-7 text-muted-foreground">
                        {lessonStage.detail}
                      </p>
                      <Progress value={lessonStage.progress} className="h-2" />
                    </div>
                  )}

                  <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 text-sm leading-7 text-muted-foreground">
                    <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      阅读建议
                    </div>
                    先读“本章你会学到什么”和“先建立直觉”，把概念吃透后，再去看“审计时先看什么”和章节练习。这样更适合零基础用户建立稳定直觉。
                  </div>

                  <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-hidden break-words text-[15px] [&_strong]:text-foreground [&_hr]:my-8 [&_p]:my-4 [&_p]:leading-8 [&_ul]:my-4 [&_ul]:space-y-2 [&_ol]:my-4 [&_ol]:space-y-2 [&_li]:leading-8">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {formattedLesson}
                    </ReactMarkdown>

                    {practiceQuestions.length > 0 && (
                      <section className="mt-10">
                        <h2 id={slugify('6. 学完后立刻自测')} className="mb-4 scroll-mt-24 border-t border-border/60 pt-8 text-2xl font-semibold tracking-tight">
                          6. 学完后立刻自测
                        </h2>
                        <div className="space-y-6">
                          {practiceQuestions.map((question, index) => (
                            <div
                              key={`practice-question-${index}`}
                              className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm"
                            >
                              <div className="border-b border-primary/10 px-5 py-4">
                                <div className="mb-2 text-sm font-medium text-primary">
                                  题目 {index + 1}
                                </div>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                  {question.questionMarkdown}
                                </ReactMarkdown>
                              </div>

                              <details className="overflow-hidden">
                                <summary className="cursor-pointer list-none px-5 py-4 transition-colors hover:bg-primary/5 [&::-webkit-details-marker]:hidden">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <p className="text-sm leading-6 text-muted-foreground">
                                      先自己独立判断，再展开参考思路。不要一上来就看答案。
                                    </p>
                                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-sm text-muted-foreground">
                                      <span>展开参考答案</span>
                                      <ChevronDown className="h-4 w-4" />
                                    </div>
                                  </div>
                                </summary>
                                <div className="border-t border-primary/10 bg-background/70 px-5 py-5">
                                  <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground">
                                    参考思路的目标不是替你背答案，而是帮你对照自己的判断，看看是否抓住了漏洞形成原因、攻击风险和标准依据。
                                  </div>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                    {question.answerMarkdown}
                                  </ReactMarkdown>
                                </div>
                              </details>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </article>
              )}
            </CardContent>
          </Card>

          <aside className="space-y-4 xl:sticky xl:top-24">
            {lessonSections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">阅读导航</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lessonSections.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {(topic.clausePrefix || topic.subClauses.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">条款引用</CardTitle>
                  <CardDescription>
                    {topic.contentSource === 'document'
                      ? '这一章的讲解边界，以这些标准条款为准。'
                      : '这一章参考了这些标准条款，但正文不是按文档章节直接展开。'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {topic.clausePrefix && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">主章节</div>
                      <Badge variant="secondary" className="mr-2">{topic.clausePrefix}</Badge>
                      <span className="text-sm text-foreground/90">{topic.vulnerabilityFocus}</span>
                    </div>
                  )}

                  {topic.subClauses.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">覆盖子条款</div>
                      <div className="space-y-2">
                        {topic.subClauses.map((item) => (
                          <div key={item.clause} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-6">
                            <div className="font-medium text-foreground">{item.clause}</div>
                            <div className="text-muted-foreground">{item.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {references.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">知识库参考</CardTitle>
                  <CardDescription>本章导学来自这些内部文档片段。</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {references.map((reference) => (
                      <Badge key={reference} variant="outline">{reference}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

async function readSseStream(
  response: Response,
  handlers: {
    onStage: (stage: LessonStageState) => void;
    onContent: (payload: LessonStreamPayload) => void;
    onMetadata: (payload: LessonStreamPayload) => void;
    onResult: (payload: LessonStreamPayload) => void;
    onError: (message: string) => void;
  },
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('浏览器不支持流式读取');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLine = event
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));

      if (!dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
      if (payload.type === 'stage' && isLessonStagePayload(payload.stage)) {
        handlers.onStage(payload.stage);
      } else if (payload.type === 'content' && typeof payload.content === 'string') {
        handlers.onContent({
          content: payload.content,
        });
      } else if (payload.type === 'metadata') {
        handlers.onMetadata({
          lessonDocument: isLessonDocumentPayload(payload.lessonDocument)
            ? payload.lessonDocument
            : isLessonDocumentPayload(payload.lesson)
              ? payload.lesson
              : undefined,
          references: Array.isArray(payload.references)
            ? payload.references.filter((reference): reference is string => typeof reference === 'string')
            : undefined,
          usage: isTokenUsagePayload(payload.usage) ? payload.usage : undefined,
        });
      } else if (payload.type === 'result') {
        handlers.onResult({
          lessonDocument: isLessonDocumentPayload(payload.lessonDocument)
            ? payload.lessonDocument
            : isLessonDocumentPayload(payload.lesson)
              ? payload.lesson
              : undefined,
          references: Array.isArray(payload.references)
            ? payload.references.filter((reference): reference is string => typeof reference === 'string')
            : undefined,
          usage: isTokenUsagePayload(payload.usage) ? payload.usage : undefined,
        });
      } else if (payload.type === 'error') {
        handlers.onError(typeof payload.error === 'string' ? payload.error : '章节内容加载失败');
      }
    }

    if (done) {
      break;
    }
  }
}

function isLessonDocumentPayload(value: unknown): value is LessonDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<LessonDocument>;
  return typeof payload.contentMarkdown === 'string'
    && Array.isArray(payload.practiceQuestions)
    && payload.practiceQuestions.every((question) => (
      question
      && typeof question === 'object'
      && typeof (question as { questionMarkdown?: unknown }).questionMarkdown === 'string'
      && typeof (question as { answerMarkdown?: unknown }).answerMarkdown === 'string'
    ));
}

function isTokenUsagePayload(value: unknown): value is TokenUsage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<TokenUsage>;
  return typeof payload.promptTokens === 'number'
    && typeof payload.completionTokens === 'number'
    && typeof payload.totalTokens === 'number'
    && typeof payload.estimated === 'boolean';
}

function isLessonStagePayload(value: unknown): value is LessonStageState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<LessonStageState>;
  return typeof payload.label === 'string'
    && typeof payload.detail === 'string'
    && typeof payload.progress === 'number';
}

function formatLessonContent(content: string, topicTitle: string): string {
  if (!content.trim()) {
    return content;
  }

  const normalizedContent = normalizeTopLevelLessonSections(content);
  const lines = normalizedContent.replace(/\r\n/g, '\n').split('\n');
  const normalizedTopicTitle = topicTitle.trim();
  const output: string[] = [];
  let skippedFirstTitle = false;
  let lastTopLevelNumber: number | null = null;
  let inNestedNumberGroup = false;
  let currentTopLevelTitle = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (!skippedFirstTitle && trimmed.length > 0) {
      if (
        trimmed === normalizedTopicTitle ||
        trimmed.includes(`新手闯关课：${normalizedTopicTitle}`) ||
        trimmed.includes(`新手闯关课: ${normalizedTopicTitle}`)
      ) {
        skippedFirstTitle = true;
        continue;
      }
      skippedFirstTitle = true;
    }

    // AI 可能输出加粗的伪标题，如 **1. 本章你会学到什么**
    const boldNumberedMatch = trimmed.match(/^\*\*(\d+)[.．、]\s*(.+?)\*\*$/);
    if (boldNumberedMatch) {
      const currentNumber = Number(boldNumberedMatch[1]);
      const headingText = stripMarkdownDecorations(boldNumberedMatch[2]).trim();
      const topLevelSection = extractTopLevelLessonSection(headingText);

      if (topLevelSection) {
        output.push(`## ${topLevelSection.numberedTitle}`);
        if (topLevelSection.rest) {
          output.push('', topLevelSection.rest);
        }
        lastTopLevelNumber = currentNumber;
        currentTopLevelTitle = topLevelSection.title;
        inNestedNumberGroup = false;
        continue;
      }
    }

    // AI 可能输出 ### 或 #### 前缀的标题，如果内容是顶级章节标题则提升为 ##
    const markdownHeadingMatch = trimmed.match(/^(#{2,4})\s+(\d+)\.\s+(.+)$/);
    if (markdownHeadingMatch) {
      const headingText = markdownHeadingMatch[3].trim();
      const currentNumber = Number(markdownHeadingMatch[2]);
      const topLevelSection = extractTopLevelLessonSection(headingText);

      if (topLevelSection) {
        output.push(`## ${topLevelSection.numberedTitle}`);
        if (topLevelSection.rest) {
          output.push('', topLevelSection.rest);
        }
        lastTopLevelNumber = currentNumber;
        currentTopLevelTitle = topLevelSection.title;
        inNestedNumberGroup = false;
      } else {
        output.push(line);
      }
      continue;
    }

    // AI 可能输出不带编号的 markdown 标题（如 ### 本章你会学到什么）
    const plainMarkdownHeadingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (plainMarkdownHeadingMatch && !markdownHeadingMatch) {
      const headingText = plainMarkdownHeadingMatch[2].trim();
      const topLevelSection = extractTopLevelLessonSection(headingText);

      if (topLevelSection && plainMarkdownHeadingMatch[1] !== '##') {
        output.push(`## ${topLevelSection.numberedTitle}`);
        if (topLevelSection.rest) {
          output.push('', topLevelSection.rest);
        }
        currentTopLevelTitle = topLevelSection.title;
        inNestedNumberGroup = false;
      } else {
        output.push(line);
      }
      continue;
    }

    // AI 也可能直接输出纯文本章节名，如“学完后立刻自测”
    const plainTopLevelSection = extractTopLevelLessonSection(trimmed);
    if (
      plainTopLevelSection
      && !trimmed.startsWith('<')
      && !trimmed.startsWith('-')
      && !trimmed.startsWith('*')
    ) {
      output.push(`## ${plainTopLevelSection.numberedTitle}`);
      if (plainTopLevelSection.rest) {
        output.push('', plainTopLevelSection.rest);
      }
      currentTopLevelTitle = plainTopLevelSection.title;
      inNestedNumberGroup = false;
      continue;
    }

    const numberedHeadingMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);

    if (numberedHeadingMatch) {
      const currentNumber = Number(numberedHeadingMatch[1]);
      const headingText = numberedHeadingMatch[2].trim();
      const topLevelSection = extractTopLevelLessonSection(headingText);
      const isTopLevelLessonSection = Boolean(topLevelSection);
      const currentSectionLooksLikeExample = isExampleSectionTitle(currentTopLevelTitle);
      const isNestedNumber =
        !isTopLevelLessonSection || (
          lastTopLevelNumber !== null
          && (
            currentNumber === 1
            || (inNestedNumberGroup && currentNumber !== lastTopLevelNumber + 1)
          )
        );

      if (currentSectionLooksLikeExample) {
        output.push(trimmed);
        inNestedNumberGroup = true;
        continue;
      }

      if (isNestedNumber) {
        output.push(`### ${trimmed}`);
        inNestedNumberGroup = true;
        continue;
      }

      output.push(`## ${topLevelSection?.numberedTitle || `${currentNumber}. ${headingText}`}`);
      if (topLevelSection?.rest) {
        output.push('', topLevelSection.rest);
      }
      lastTopLevelNumber = currentNumber;
      currentTopLevelTitle = topLevelSection?.title || headingText;
      inNestedNumberGroup = false;
      continue;
    }

    if (/^[（(]\d+[）)]\s+/.test(trimmed) && !trimmed.startsWith('###')) {
      output.push(`### ${trimmed}`);
      continue;
    }

    output.push(line);
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isExampleSectionTitle(title: string): boolean {
  return /例子|案例|示例|实战|场景|流程|步骤|清单|演示/.test(title);
}

function isTopLevelLessonSectionTitle(title: string): boolean {
  if (extractTopLevelLessonSection(title)) {
    return true;
  }

  const normalizedTitle = stripMarkdownDecorations(title).replace(/\s+/g, ' ').trim();
  return TOP_LEVEL_LESSON_SECTION_PATTERNS.some((pattern) => pattern.test(normalizedTitle));
}

function extractTopLevelLessonSection(title: string): { index: number; title: string; numberedTitle: string; rest: string } | null {
  const normalizedTitle = normalizeSectionText(stripMarkdownDecorations(title));

  for (const section of TOP_LEVEL_LESSON_SECTIONS) {
    if (normalizedTitle === section.title) {
      return {
        index: section.index,
        title: section.title,
        numberedTitle: `${section.index}. ${section.title}`,
        rest: '',
      };
    }

    const match = normalizedTitle.match(new RegExp(`^${escapeRegExp(section.title)}(?:[：:？?]+|\s+)([\s\S]+)$`));
    if (match) {
      return {
        index: section.index,
        title: section.title,
        numberedTitle: `${section.index}. ${section.title}`,
        rest: match[1].trim(),
      };
    }
  }

  return null;
}

function normalizeTopLevelLessonSections(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => normalizeTopLevelLessonSectionLine(line))
    .join('\n');
}

function normalizeTopLevelLessonSectionLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return line;
  }

  const linePrefix = line.match(/^\s*/)?.[0] ?? '';
  const normalizedLine = normalizeSectionText(stripMarkdownDecorations(trimmed))
    .replace(/^[#*\-\d.．、()（）\s]+/, '')
    .trim();

  for (const section of TOP_LEVEL_LESSON_SECTIONS) {
    const match = normalizedLine.match(new RegExp(`^${escapeRegExp(section.title)}(?:[：:？?]+|\s+)?([\s\S]*)$`));
    if (!match) {
      continue;
    }

    const rest = match[1].trim();
    if (rest) {
      return `${linePrefix}## ${section.index}. ${section.title}\n\n${linePrefix}${rest}`;
    }

    return `${linePrefix}## ${section.index}. ${section.title}`;
  }

  return line;
}

function extractLessonSections(content: string): LessonSection[] {
  const h2Matches = content.matchAll(/^##\s+(.+)$/gm);
  const sections = Array.from(h2Matches).map((match) => {
    const rawTitle = match[1].trim();
    const title = stripMarkdownDecorations(rawTitle);
    return { id: slugify(title), title };
  });

  // 如果没有 h2 标题，回退到 h3
  if (sections.length === 0) {
    const h3Matches = content.matchAll(/^###\s+(.+)$/gm);
    return Array.from(h3Matches)
      .filter((match) => isTopLevelLessonSectionTitle(stripMarkdownDecorations(match[1].trim())))
      .map((match) => {
        const rawTitle = match[1].trim();
        const title = stripMarkdownDecorations(rawTitle);
        return { id: slugify(title), title };
      });
  }

  return sections;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function extractText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return extractText(child.props.children);
      }
      return '';
    })
    .join('');
}

function normalizeLessonMarkdown(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/(strong|b)>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/(em|i)>/gi, '*$2*')
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_match, code: string) => `\`${code.replace(/`/g, '').trim()}\``)
    .replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')
    .trim();
}

function stripMarkdownDecorations(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSectionText(content: string): string {
  return content
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[：:]+$/, '')
    .trim();
}
