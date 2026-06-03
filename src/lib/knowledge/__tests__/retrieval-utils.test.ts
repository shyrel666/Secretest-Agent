import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractClauseNumbers, computeRrfScore } from '../hybrid-search';
import { tokenizeQuery, buildFtsQuery } from '../chinese-tokenizer';
import { expandQuery } from '../query-expansion';
import {
  resolveCandidatePoolSize,
  resolveMaxExpandedResults,
  resolveSqlFetchLimit,
  resetRetrievalConfig,
} from '../retrieval-config';

describe('extractClauseNumbers', () => {
  it('extracts dotted clause numbers', () => {
    const nums = extractClauseNumbers('Java SQL注入 6.2.3.4 漏洞');
    assert.ok(nums.includes('6.2.3.4'));
  });

  it('extracts 第 N 条 format', () => {
    const nums = extractClauseNumbers('参见第 6.2.3.4 条');
    assert.ok(nums.includes('6.2.3.4'));
  });

  it('extracts appendix clauses', () => {
    const nums = extractClauseNumbers('附录 A.1 说明');
    assert.ok(nums.includes('A.1'));
  });

  it('does not treat GB/T standard number as clause', () => {
    const nums = extractClauseNumbers('GB/T 34944-2017 总则');
    assert.equal(nums.length, 0);
  });
});

describe('computeRrfScore', () => {
  it('sums reciprocal ranks with weight', () => {
    const score = computeRrfScore([
      { rank: 1, weight: 1 },
      { rank: 2, weight: 2 },
    ], 60);
    assert.ok(score > 0);
    assert.ok(score > 1 / 61);
  });
});

describe('chinese-tokenizer', () => {
  it('tokenizes CJK runs into unigrams and bigrams', () => {
    const terms = tokenizeQuery('SQL注入');
    assert.ok(terms.length >= 2);
  });

  it('builds OR fts query', () => {
    const q = buildFtsQuery('跨站脚本');
    assert.ok(q?.includes(' OR '));
  });

  it('preserves quoted multi-word segments as fts phrases', () => {
    const q = buildFtsQuery('SQL注入 "SQL injection"');
    // 多词短语应作为一个 FTS5 短语 token 保留，而不是拆成 sql / injection
    assert.ok(q?.includes('"SQL injection"'), q ?? 'null');
  });

  it('does not phrase-wrap single-word quoted segments', () => {
    const q = buildFtsQuery('"PreparedStatement"');
    // 单词被去引号后交给普通分词器，最终仍是小写单词 token
    assert.ok(q?.includes('"preparedstatement"'), q ?? 'null');
  });

  it('returns null for empty query', () => {
    assert.equal(buildFtsQuery('   '), null);
  });
});

describe('expandQuery', () => {
  it('appends synonyms for SQL injection', () => {
    const expanded = expandQuery('SQL注入漏洞');
    assert.notEqual(expanded, 'SQL注入漏洞');
    assert.match(expanded, /injection|参数化/i);
  });

  it('leaves unrelated queries unchanged', () => {
    assert.equal(expandQuery('hello world'), 'hello world');
  });
});

describe('retrieval-config', () => {
  it('resolves candidate pool size', () => {
    resetRetrievalConfig();
    assert.equal(resolveCandidatePoolSize(5), 20);
    assert.equal(resolveCandidatePoolSize(10), 40);
  });

  it('resolves sql fetch limit', () => {
    resetRetrievalConfig();
    assert.equal(resolveSqlFetchLimit(5), 15);
    assert.equal(resolveSqlFetchLimit(5, ['java']), 50);
  });

  it('caps expanded results', () => {
    resetRetrievalConfig();
    const max = resolveMaxExpandedResults(5);
    assert.ok(max >= 5);
    assert.ok(max <= 12);
  });
});
