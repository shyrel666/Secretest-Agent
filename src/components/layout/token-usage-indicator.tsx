'use client';

import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Eraser, Sigma } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useTokenUsageStore } from '@/lib/store/token-usage';
import { cn } from '@/lib/utils';
import {
  aggregateTokenUsageByDateKeys,
  aggregateTokenUsageByWeek,
  formatWeekRangeLabel,
  formatTokenCount,
  getLocalDateKey,
  getStartOfWeek,
  sumTokenUsage,
} from '@/lib/token-usage';

const featureLabels = {
  audit: '代码审计',
  assessment: '能力测评',
  explain: '错题讲解',
  knowledge: '知识库',
  learning: '学习章节',
  report: '学习报告',
} as const;

const dailyChartConfig = {
  totalTokens: {
    label: '总计',
    color: '#22c7c7',
  },
};

const featureChartConfig = {
  tokens: {
    label: 'Token',
    color: '#22c7c7',
  },
};

function UsageInfoCell({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/45 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm ${emphasize ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}>
        {value}
      </div>
    </div>
  );
}

export function TokenUsageIndicator() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <TokenUsageTriggerContent disabled totalTokens={0} />;
  }

  return <MountedTokenUsageIndicator />;
}

type TokenUsageTriggerContentProps = Omit<ComponentProps<typeof Button>, 'children' | 'size' | 'variant'> & {
  totalTokens: number;
};

function TokenUsageTriggerContent({
  className,
  disabled = false,
  totalTokens,
  ...buttonProps
}: TokenUsageTriggerContentProps) {
  return (
    <Button
      {...buttonProps}
      variant="outline"
      size="sm"
      className={cn('gap-2', className)}
      disabled={disabled}
    >
      <Sigma className="h-4 w-4" />
      <span className="hidden lg:inline">今日累计</span>
      <span>≈ {formatTokenCount(totalTokens)} tokens</span>
    </Button>
  );
}

function MountedTokenUsageIndicator() {
  const records = useTokenUsageStore((state) => state.records);
  const clearRecords = useTokenUsageStore((state) => state.clearRecords);
  const [selectedWeekStartKey, setSelectedWeekStartKey] = useState(() => getLocalDateKey(getStartOfWeek(new Date())));
  const currentWeekStartKey = getLocalDateKey(getStartOfWeek(new Date()));
  const selectedWeekStart = useMemo(() => getStartOfWeek(selectedWeekStartKey), [selectedWeekStartKey]);
  const todayUsage = useMemo(() => aggregateTokenUsageByDateKeys(records, [getLocalDateKey(new Date())])[0] || {
    dateKey: getLocalDateKey(new Date()),
    label: '今天',
    shortLabel: '今天',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimated: false,
    recordCount: 0,
  }, [records]);
  const weekDailyUsage = useMemo(() => aggregateTokenUsageByWeek(records, selectedWeekStart), [records, selectedWeekStart]);
  const weekUsage = useMemo(() => sumTokenUsage(weekDailyUsage), [weekDailyUsage]);
  const latestRecord = records[0];
  const weeklyDateKeys = useMemo(() => new Set(weekDailyUsage.map((item) => item.dateKey)), [weekDailyUsage]);
  const weeklyRecords = useMemo(
    () => records.filter((record) => weeklyDateKeys.has(getLocalDateKey(record.createdAt))),
    [records, weeklyDateKeys],
  );
  const activeDays = useMemo(
    () => weekDailyUsage.filter((item) => item.totalTokens > 0).length,
    [weekDailyUsage],
  );
  const earliestWeekStartKey = useMemo(
    () => records.length > 0 ? getLocalDateKey(getStartOfWeek(records[records.length - 1].createdAt)) : currentWeekStartKey,
    [records, currentWeekStartKey],
  );
  const canGoPrevWeek = selectedWeekStartKey > earliestWeekStartKey;
  const canGoNextWeek = selectedWeekStartKey < currentWeekStartKey;
  const isCurrentWeek = selectedWeekStartKey === currentWeekStartKey;
  const weekRangeLabel = useMemo(() => formatWeekRangeLabel(selectedWeekStart), [selectedWeekStart]);
  const featureData = useMemo(() => {
    const totals = new Map<string, { feature: string; tokens: number; count: number }>();

    weeklyRecords.forEach((record) => {
      const feature = featureLabels[record.feature];
      const current = totals.get(feature) || { feature, tokens: 0, count: 0 };

      totals.set(feature, {
        feature,
        tokens: current.tokens + record.totalTokens,
        count: current.count + 1,
      });
    });

    return Array.from(totals.values())
      .sort((left, right) => right.tokens - left.tokens)
      .slice(0, 6);
  }, [weeklyRecords]);

  function shiftSelectedWeek(offset: number) {
    setSelectedWeekStartKey((currentKey) => {
      const nextDate = getStartOfWeek(currentKey);
      nextDate.setDate(nextDate.getDate() + (offset * 7));
      return getLocalDateKey(nextDate);
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <TokenUsageTriggerContent totalTokens={todayUsage.totalTokens} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-12">
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              每周 Token 消耗
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="mr-2 shrink-0"
              onClick={clearRecords}
              disabled={records.length === 0}
            >
              <Eraser className="mr-2 h-4 w-4" />
              清空历史
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">今日 prompt</div>
              <div className="mt-1 text-2xl font-semibold">{formatTokenCount(todayUsage.promptTokens)}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">今日 completion</div>
              <div className="mt-1 text-2xl font-semibold">{formatTokenCount(todayUsage.completionTokens)}</div>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="text-xs text-muted-foreground">当周总计</div>
              <div className="mt-1 text-2xl font-semibold text-primary">{formatTokenCount(weekUsage.totalTokens)}</div>
              <div className="mt-1 text-xs text-muted-foreground">活跃 {activeDays} / 7 天</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
            <div>
              <div className="text-sm font-medium">{isCurrentWeek ? '本周' : '所选周'}</div>
              <div className="text-xs text-muted-foreground">{weekRangeLabel}，按周一到周日统计</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => shiftSelectedWeek(-1)} disabled={!canGoPrevWeek}>
                <ChevronLeft className="h-4 w-4" />
                上周
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedWeekStartKey(currentWeekStartKey)} disabled={isCurrentWeek}>
                本周
              </Button>
              <Button variant="outline" size="sm" onClick={() => shiftSelectedWeek(1)} disabled={!canGoNextWeek}>
                下周
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="mb-3">
                <div className="text-sm font-medium">按天统计</div>
                <div className="text-xs text-muted-foreground">查看所选自然周内每天累计消耗的 token</div>
              </div>
              <ChartContainer config={dailyChartConfig} className="h-[260px] w-full aspect-auto">
                <BarChart data={weekDailyUsage} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="shortLabel"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(value: number) => formatTokenCount(value)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as (typeof weekDailyUsage)[number] | undefined;
                          return point ? `${point.label} · ${point.shortLabel}` : '';
                        }}
                        formatter={(value, _name, item) => {
                          const point = item.payload as (typeof weekDailyUsage)[number];

                          return (
                            <div className="min-w-[180px] space-y-2">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">总计</span>
                                <span className="font-mono font-medium text-foreground">{formatTokenCount(Number(value))}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Prompt</span>
                                <span className="font-mono text-foreground">{formatTokenCount(point.promptTokens)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">Completion</span>
                                <span className="font-mono text-foreground">{formatTokenCount(point.completionTokens)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-muted-foreground">调用次数</span>
                                <span className="font-mono text-foreground">{point.recordCount}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <Bar dataKey="totalTokens" fill="var(--color-totalTokens)" radius={8} />
                </BarChart>
              </ChartContainer>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="mb-3">
                <div className="text-sm font-medium">功能分布</div>
                <div className="text-xs text-muted-foreground">所选自然周里哪类操作最耗 token</div>
              </div>
              {featureData.length > 0 ? (
                <ChartContainer config={featureChartConfig} className="h-[260px] w-full aspect-auto">
                  <BarChart data={featureData} layout="vertical" margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => formatTokenCount(value)}
                    />
                    <YAxis
                      dataKey="feature"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, _name, item) => {
                            const point = item.payload as { feature: string; count: number };

                            return (
                              <div className="flex min-w-[160px] items-center justify-between gap-4">
                                <div>
                                  <div className="text-foreground">{point.feature}</div>
                                  <div className="text-muted-foreground">{point.count} 次调用</div>
                                </div>
                                <span className="font-mono font-medium text-foreground">{formatTokenCount(Number(value))}</span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey="tokens" fill="var(--color-tokens)" radius={8} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
                  这一周还没有功能分布数据。
                </div>
              )}
            </div>
          </div>

          {latestRecord && (
            <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/8 via-background/90 to-background/90 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">最近一次调用</div>
                <Badge variant="secondary">{featureLabels[latestRecord.feature]}</Badge>
              </div>
              <div className="space-y-3">
                <div className="text-base font-medium text-foreground">{latestRecord.action}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <UsageInfoCell label="模型" value={latestRecord.modelLabel || '模型未记录'} />
                  <UsageInfoCell
                    label="时间"
                    value={new Date(latestRecord.createdAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  />
                  <UsageInfoCell label="Prompt" value={formatTokenCount(latestRecord.promptTokens)} />
                  <UsageInfoCell label="Completion" value={formatTokenCount(latestRecord.completionTokens)} />
                  <UsageInfoCell label="总计" value={`≈ ${formatTokenCount(latestRecord.totalTokens)} tokens`} emphasize />
                  <UsageInfoCell label="计费方式" value={latestRecord.estimated ? '估算值' : '实际值'} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">当周调用明细</div>
            {weeklyRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                这一自然周还没有使用记录。完成一次审计、生成题目或讲解后，这里会按周汇总显示 token 消耗。
              </div>
            ) : (
              weeklyRecords.map((record) => (
                <div key={record.id} className="rounded-2xl border border-border/60 bg-gradient-to-r from-background/95 to-background/70 p-4 transition-colors hover:border-primary/20">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{featureLabels[record.feature]}</Badge>
                    <span className="text-sm font-medium text-foreground">{record.action}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <UsageInfoCell label="模型" value={record.modelLabel || '模型未记录'} />
                    <UsageInfoCell
                      label="时间"
                      value={new Date(record.createdAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    />
                    <UsageInfoCell label="Prompt" value={formatTokenCount(record.promptTokens)} />
                    <UsageInfoCell label="Completion" value={formatTokenCount(record.completionTokens)} />
                    <UsageInfoCell label="总计" value={formatTokenCount(record.totalTokens)} emphasize />
                    <UsageInfoCell label="计费方式" value={record.estimated ? '估算值' : '实际值'} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
