import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  aggregateTokenUsageByWeek,
  getLocalDateKey,
  getStartOfWeek,
  shouldRecordTokenUsage,
  type TokenUsageRecord,
} from '../token-usage';

const originalTimezone = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';

after(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

describe('token usage date helpers', () => {
  it('treats YYYY-MM-DD keys as local dates when resolving week start', () => {
    const weekStart = getStartOfWeek('2026-06-22');

    assert.equal(getLocalDateKey(weekStart), '2026-06-22');
  });

  it('keeps Monday usage inside the selected Monday-start week in UTC-west timezones', () => {
    const record: TokenUsageRecord = {
      id: 'usage_1',
      feature: 'learning',
      action: '生成章节',
      createdAt: new Date(2026, 5, 22, 12, 0, 0).toISOString(),
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimated: false,
    };

    const week = aggregateTokenUsageByWeek([record], '2026-06-22');

    assert.deepEqual(
      week.map((day) => day.dateKey),
      [
        '2026-06-22',
        '2026-06-23',
        '2026-06-24',
        '2026-06-25',
        '2026-06-26',
        '2026-06-27',
        '2026-06-28',
      ],
    );
    assert.equal(week[0].totalTokens, 15);
  });
});

describe('shouldRecordTokenUsage', () => {
  const usage = {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    estimated: false,
  };

  it('records non-cached positive usage', () => {
    assert.equal(shouldRecordTokenUsage(usage), true);
  });

  it('does not record cached usage replayed by server streams', () => {
    assert.equal(shouldRecordTokenUsage(usage, { fromCache: true }), false);
  });
});
