'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Brain, Clock3, ArrowRight, CheckCircle2, Database, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { LearningTopicLanguage, DynamicLearningTopic } from '@/lib/learning/topics';
import { useLearningProgressStore } from '@/lib/store/learning-progress';
import { cn } from '@/lib/utils';
import { getLanguageLabel, isStandardType } from '@/lib/standards';

const languageLabels: Record<LearningTopicLanguage, string> = {
  java: 'Java 新手闯关课',
  cpp: 'C/C++ 新手闯关课',
  csharp: 'C# 新手闯关课',
};

export default function LearningPage() {
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [allTopics, setAllTopics] = useState<DynamicLearningTopic[]>([]);
  const topicsProgress = useLearningProgressStore((state) => state.topics);
  const latestAssessmentRecommendation = useLearningProgressStore((state) => state.latestAssessmentRecommendation);
  const resetLearningProgress = useLearningProgressStore((state) => state.resetLearningProgress);

  useEffect(() => {
    let cancelled = false;

    const loadTopics = async () => {
      try {
        const response = await fetch('/api/learning/topics', { cache: 'no-store' });
        const data = await response.json();
        if (!cancelled && data.success) {
          setAllTopics(Array.isArray(data.topics) ? data.topics : []);
        }
      } catch {
        if (!cancelled) {
          setAllTopics([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDocs(false);
        }
      }
    };

    loadTopics();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableTypes = useMemo(() => {
    return Array.from(
      new Set(
        allTopics
          .map((t) => t.language)
          .filter((type): type is LearningTopicLanguage => isStandardType(type)),
      ),
    );
  }, [allTopics]);

  const coreTopics = useMemo(
    () => allTopics.filter((topic) => topic.topicGroup !== 'supplemental'),
    [allTopics],
  );

  const supplementalTopics = useMemo(
    () => allTopics.filter((topic) => topic.topicGroup === 'supplemental'),
    [allTopics],
  );

  const availableTopics = coreTopics;

  const completedCount = useMemo(
    () => availableTopics.filter((topic) => topicsProgress[topic.id]?.completedAt).length,
    [availableTopics, topicsProgress],
  );

  const nextTopic = useMemo(
    () => availableTopics.find((topic) => !topicsProgress[topic.id]?.completedAt) || availableTopics[0],
    [availableTopics, topicsProgress],
  );

  const recommendedFromAssessment = useMemo(() => {
    if (!latestAssessmentRecommendation?.topicIds?.length) {
      return [];
    }

    return latestAssessmentRecommendation.topicIds
      .map((topicId) => availableTopics.find((topic) => topic.id === topicId))
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
      .slice(0, 3);
  }, [availableTopics, latestAssessmentRecommendation]);

  const groupedTopics = useMemo(() => ({
    java: coreTopics.filter((topic) => topic.language === 'java'),
    cpp: coreTopics.filter((topic) => topic.language === 'cpp'),
    csharp: coreTopics.filter((topic) => topic.language === 'csharp'),
  }), [coreTopics]);

  const groupedSupplementalTopics = useMemo(() => ({
    java: supplementalTopics.filter((topic) => topic.language === 'java'),
    cpp: supplementalTopics.filter((topic) => topic.language === 'cpp'),
    csharp: supplementalTopics.filter((topic) => topic.language === 'csharp'),
  }), [supplementalTopics]);

  if (isLoadingDocs) {
    return (
      <div className="min-h-screen py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              正在检查知识库文档，准备学习路径...
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
            <CardHeader className="space-y-4 pb-2">
              <Badge variant="outline" className="w-fit border-primary/30 text-primary">
                新手闯关课
              </Badge>
              <div className="space-y-3">
                <CardTitle className="text-3xl leading-tight">先学会看漏洞，再去做能力测评</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  这一模块面向零基础用户。系统会基于你上传的内部标准文档，按章节拆解核心概念、典型漏洞和审计检查点，帮你先建立直觉，再进入练习。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <BookOpen className="h-4 w-4 text-primary" />
                  主线章节
                </div>
                <div className="text-3xl font-semibold">{availableTopics.length}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  已完成
                </div>
                <div className="text-3xl font-semibold">{completedCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-4 w-4 text-amber-400" />
                  已上传标准
                </div>
                <div className="text-3xl font-semibold">{availableTypes.length}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Brain className="h-5 w-5 text-primary" />
                当前推荐
              </CardTitle>
              <CardDescription>
                {recommendedFromAssessment.length > 0
                  ? '系统结合你最近一次测评结果，优先推荐最该补的章节。'
                  : '建议按章节顺序推进，学完一章就去做对应练习。'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(recommendedFromAssessment[0] || nextTopic) ? (
                <div className="space-y-4">
                  <div>
                    {recommendedFromAssessment.length > 0 && (
                      <Badge className="mb-3 bg-amber-500/15 text-amber-300">来自最近一次测评建议</Badge>
                    )}
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary">{getLanguageLabel((recommendedFromAssessment[0] || nextTopic)!.language)}</Badge>
                      <Badge variant="outline">{(recommendedFromAssessment[0] || nextTopic)!.standard}</Badge>
                      <Badge
                        variant="outline"
                        className={(recommendedFromAssessment[0] || nextTopic)!.contentSource === 'document'
                          ? 'border-emerald-400/40 text-emerald-300'
                          : 'border-amber-400/40 text-amber-300'}
                      >
                        {(recommendedFromAssessment[0] || nextTopic)!.contentSource === 'document' ? '文档生成' : '检索回退'}
                      </Badge>
                    </div>
                    <h2 className="text-xl font-semibold">{(recommendedFromAssessment[0] || nextTopic)!.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{(recommendedFromAssessment[0] || nextTopic)!.summary}</p>
                  </div>
                  <Link href={`/learning/${(recommendedFromAssessment[0] || nextTopic)!.id}`}>
                    <Button className="w-full gap-2">
                      开始本章学习
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-muted-foreground">
                    还没有可用学习章节。先去知识库上传标准文档，系统才能基于内部文档生成导学内容。
                  </p>
                  <Link href="/knowledge">
                    <Button variant="outline" className="w-full">去上传标准文档</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {recommendedFromAssessment.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">最近测评建议</CardTitle>
              <CardDescription>
                这些章节来自你最近一次能力测评暴露出的薄弱点，建议优先回看。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {recommendedFromAssessment.map((topic) => (
                  <Link key={topic.id} href={`/learning/${topic.id}`}>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4 transition-colors hover:border-primary/40">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary">{getLanguageLabel(topic.language)}</Badge>
                        <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
                        <Badge
                          variant="outline"
                          className={topic.contentSource === 'document'
                            ? 'border-emerald-400/40 text-emerald-300'
                            : 'border-amber-400/40 text-amber-300'}
                        >
                          {topic.contentSource === 'document' ? '文档生成' : '检索回退'}
                        </Badge>
                      </div>
                      <div className="font-medium">{topic.title}</div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {availableTopics.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="text-xl">学习进度</CardTitle>
                  <CardDescription>当前学习身份的进度与导学缓存会独立保存在本浏览器中。</CardDescription>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      清除缓存
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认清除学习缓存</AlertDialogTitle>
                      <AlertDialogDescription>
                        这将清除所有章节的学习进度和已缓存的导学内容。下次进入章节时会重新生成。此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => resetLearningProgress()}
                      >
                        确认清除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>整体完成度</span>
                <span>{completedCount} / {availableTopics.length}</span>
              </div>
              <Progress value={availableTopics.length === 0 ? 0 : (completedCount / availableTopics.length) * 100} className="h-2" />
            </CardContent>
          </Card>
        )}

        {availableTopics.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">学习模块尚未激活</CardTitle>
              <CardDescription>
                目前没有检测到可用于学习的标准文档。请先在知识库中上传 Java、C/C++ 或 C# 标准后再回来学习。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/knowledge">
                <Button className="gap-2">
                  去知识库上传文档
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          (Object.entries(groupedTopics) as Array<[LearningTopicLanguage, typeof availableTopics]>).map(([language, topics]) => {
            if (topics.length === 0) return null;

            const supplementalForLanguage = groupedSupplementalTopics[language];

            return (
              <section key={language} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">{languageLabels[language]}</h2>
                    <p className="text-sm text-muted-foreground">默认按标准 6.2.x 主线推进；附录案例放在折叠区，作为补充阅读。</p>
                  </div>
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {topics.map((topic) => {
                    const progress = topicsProgress[topic.id];
                    const isCompleted = Boolean(progress?.completedAt);
                    const completionRate = progress?.completionRate || 0;

                    return (
                      <Link key={topic.id} href={`/learning/${topic.id}`}>
                        <Card className="h-full border-border/70 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                          <CardHeader className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={cn(
                                  topic.language === 'java' ? 'border-teal-400/40 text-teal-300'
                                    : topic.language === 'csharp' ? 'border-sky-400/40 text-sky-300'
                                    : 'border-amber-400/40 text-amber-300',
                                )}>
                                  {getLanguageLabel(topic.language)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={topic.contentSource === 'document'
                                    ? 'border-emerald-400/40 text-emerald-300'
                                    : 'border-amber-400/40 text-amber-300'}
                                >
                                  {topic.contentSource === 'document' ? '文档生成' : '检索回退'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                {topic.estimatedMinutes} 分钟
                              </div>
                            </div>
                            <div>
                              <CardTitle className="text-lg leading-7">{topic.title}</CardTitle>
                              <CardDescription className="mt-2 text-sm leading-7">{topic.summary}</CardDescription>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="secondary">{topic.standard}</Badge>
                              <Badge variant="outline">{topic.vulnerabilityFocus}</Badge>
                            </div>
                            {topic.subClauses.length > 0 && (
                              <div className="text-xs leading-6 text-muted-foreground">
                                {topic.subClauses.slice(0, 4).map((sc) => sc.title).filter(t => t && !t.match(/^\d/)).join('、')}
                                {topic.subClauses.length > 4 && `等 ${topic.subClauses.length} 项`}
                              </div>
                            )}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{isCompleted ? '已完成' : '学习进度'}</span>
                                <span>{completionRate}%</span>
                              </div>
                              <Progress value={completionRate} className="h-2" />
                            </div>
                            <div className="flex items-center gap-2 text-sm font-medium text-primary">
                              {isCompleted ? '复习本章' : '进入学习'}
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>

                {supplementalForLanguage.length > 0 && (
                  <details className="overflow-hidden rounded-2xl border border-border/60 bg-background/60">
                    <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                      展开补充章节（附录案例 / 测试过程）
                      <span className="ml-2 text-xs text-muted-foreground">共 {supplementalForLanguage.length} 章</span>
                    </summary>
                    <div className="grid gap-4 border-t border-border/60 p-5 md:grid-cols-2 xl:grid-cols-3">
                      {supplementalForLanguage.map((topic) => (
                        <Link key={topic.id} href={`/learning/${topic.id}`}>
                          <Card className="h-full border-border/70 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                            <CardHeader className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">附录章节</Badge>
                                  <Badge
                                    variant="outline"
                                    className={topic.contentSource === 'document'
                                      ? 'border-emerald-400/40 text-emerald-300'
                                      : 'border-amber-400/40 text-amber-300'}
                                  >
                                    {topic.contentSource === 'document' ? '文档生成' : '检索回退'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {topic.estimatedMinutes} 分钟
                                </div>
                              </div>
                              <div>
                                <CardTitle className="text-base leading-7">{topic.title}</CardTitle>
                                <CardDescription className="mt-2 text-sm leading-7">{topic.summary}</CardDescription>
                              </div>
                            </CardHeader>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
