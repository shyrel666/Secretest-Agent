export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
}

export interface TokenUsageRecord extends TokenUsage {
  id: string;
  feature: 'audit' | 'assessment' | 'explain' | 'knowledge' | 'learning' | 'report';
  action: string;
  modelId?: string;
  modelLabel?: string;
  createdAt: string;
}

export interface TokenUsageDaySummary extends TokenUsage {
  dateKey: string;
  label: string;
  shortLabel: string;
  recordCount: number;
}

export function estimateTokensFromText(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  const segments = text.match(/[\u4e00-\u9fff]|[A-Za-z_][A-Za-z0-9_]*|\d+|[^\s]/g) || [];

  return segments.reduce((sum, segment) => {
    if (/^[\u4e00-\u9fff]$/.test(segment)) {
      return sum + 1;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      return sum + Math.max(1, Math.ceil(segment.length / 4));
    }

    if (/^\d+$/.test(segment)) {
      return sum + Math.max(1, Math.ceil(segment.length / 2));
    }

    return sum + 1;
  }, 0);
}

export function estimateMessageTokens(
  messages: Array<{ role: string; content: string | Array<{ text?: string }> }>,
): number {
  return messages.reduce((sum, message) => {
    const content = typeof message.content === 'string'
      ? message.content
      : message.content.map((item) => item.text || '').join('\n');

    return sum + 8 + estimateTokensFromText(content);
  }, 0);
}

export function createEstimatedUsage(params: {
  promptText?: string;
  completionText?: string;
  messages?: Array<{ role: string; content: string | Array<{ text?: string }> }>;
}): TokenUsage {
  const promptTokens = params.messages
    ? estimateMessageTokens(params.messages)
    : estimateTokensFromText(params.promptText || '');
  const completionTokens = estimateTokensFromText(params.completionText || '');

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

export function sumTokenUsage(usages: Array<TokenUsage | undefined | null>): TokenUsage {
  return usages.reduce<TokenUsage>((total, usage) => {
    if (!usage) {
      return total;
    }

    return {
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
      estimated: total.estimated || usage.estimated,
    };
  }, {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimated: false,
  });
}

export function formatTokenCount(value: number): string {
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return value.toLocaleString('zh-CN');
}

export function hasTokenUsage(usage?: TokenUsage | null): boolean {
  return Boolean(usage && usage.totalTokens > 0);
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, '0');
}

export function getLocalDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatUsageDateLabel(dateKey: string, referenceDate: Date = new Date()): string {
  const referenceKey = getLocalDateKey(referenceDate);

  if (dateKey === referenceKey) {
    return '今天';
  }

  return parseLocalDateKey(dateKey).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatUsageDateShortLabel(dateKey: string): string {
  return parseLocalDateKey(dateKey).toLocaleDateString('zh-CN', {
    weekday: 'short',
  });
}

export function getStartOfWeek(value: Date | string, weekStartsOn: 0 | 1 = 1): Date {
  const rawDate = typeof value === 'string' ? new Date(value) : value;
  const date = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
  const day = date.getDay();
  const diff = (day - weekStartsOn + 7) % 7;

  date.setDate(date.getDate() - diff);
  return date;
}

export function getWeekDateKeys(value: Date | string, weekStartsOn: 0 | 1 = 1): string[] {
  const weekStart = getStartOfWeek(value, weekStartsOn);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return getLocalDateKey(date);
  });
}

export function formatWeekRangeLabel(value: Date | string, weekStartsOn: 0 | 1 = 1): string {
  const weekStart = getStartOfWeek(value, weekStartsOn);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const startLabel = weekStart.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
  const endLabel = weekEnd.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });

  return `${startLabel} - ${endLabel}`;
}

export function getRecentDateKeys(days: number, referenceDate: Date = new Date()): string[] {
  const keys: string[] = [];
  const anchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    keys.push(getLocalDateKey(date));
  }

  return keys;
}

export function getRecordsForDate(records: TokenUsageRecord[], dateKey: string): TokenUsageRecord[] {
  return records.filter((record) => getLocalDateKey(record.createdAt) === dateKey);
}

export function aggregateTokenUsageByDateKeys(
  records: TokenUsageRecord[],
  dateKeys: string[],
  referenceDate: Date = new Date(),
): TokenUsageDaySummary[] {
  const dailyTotals = new Map<string, TokenUsageDaySummary>();

  records.forEach((record) => {
    const dateKey = getLocalDateKey(record.createdAt);
    const current = dailyTotals.get(dateKey) || {
      dateKey,
      label: formatUsageDateLabel(dateKey, referenceDate),
      shortLabel: formatUsageDateShortLabel(dateKey),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false,
      recordCount: 0,
    };

    dailyTotals.set(dateKey, {
      ...current,
      promptTokens: current.promptTokens + record.promptTokens,
      completionTokens: current.completionTokens + record.completionTokens,
      totalTokens: current.totalTokens + record.totalTokens,
      estimated: current.estimated || record.estimated,
      recordCount: current.recordCount + 1,
    });
  });

  return dateKeys.map((dateKey) => {
    const usage = dailyTotals.get(dateKey);

    return usage || {
      dateKey,
      label: formatUsageDateLabel(dateKey, referenceDate),
      shortLabel: formatUsageDateShortLabel(dateKey),
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false,
      recordCount: 0,
    };
  });
}

export function aggregateTokenUsageByDay(
  records: TokenUsageRecord[],
  days: number,
  referenceDate: Date = new Date(),
): TokenUsageDaySummary[] {
  return aggregateTokenUsageByDateKeys(records, getRecentDateKeys(days, referenceDate), referenceDate);
}

export function aggregateTokenUsageByWeek(
  records: TokenUsageRecord[],
  referenceDate: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
): TokenUsageDaySummary[] {
  return aggregateTokenUsageByDateKeys(records, getWeekDateKeys(referenceDate, weekStartsOn), referenceDate);
}