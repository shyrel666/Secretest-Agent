import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  average,
  findFirstRelevantRank,
  inferQueryType,
  isClauseMatch,
  isPrimaryEvalQuery,
  isRelevant,
  percentile,
  recallAtK,
  reciprocalRank,
  type GoldenQuery,
} from '../metrics';

const docTypeMap = new Map([
  ['doc_java', 'java'],
  ['doc_cpp', 'cpp'],
]);

function gq(overrides: Partial<GoldenQuery> & Pick<GoldenQuery, 'id' | 'query' | 'expectedClause'>): GoldenQuery {
  return {
    standardType: 'java',
    ...overrides,
  };
}

describe('isClauseMatch', () => {
  it('matches exact and child clauses', () => {
    assert.equal(isClauseMatch('6.2.3.4', '6.2.3.4'), true);
    assert.equal(isClauseMatch('6.2.3.4.1', '6.2.3.4'), true);
    assert.equal(isClauseMatch('6.2.3.3', '6.2.3.4'), false);
  });
});

describe('isRelevant', () => {
  it('checks clause and document type', () => {
    const expected = gq({
      id: 'java-sql',
      query: 'SQL注入',
      expectedClause: '6.2.3.4',
      standardType: 'java',
    });

    assert.equal(
      isRelevant('6.2.3.4', undefined, expected, docTypeMap, 'doc_java'),
      true,
    );
    assert.equal(
      isRelevant('6.2.3.4', undefined, expected, docTypeMap, 'doc_cpp'),
      false,
    );
    assert.equal(
      isRelevant('6.2.3.4', undefined, expected, new Map(), 'doc_unknown'),
      false,
    );
  });
});

describe('findFirstRelevantRank', () => {
  it('only considers top-K results', () => {
    const expected = gq({
      id: 'java-sql',
      query: 'SQL注入',
      expectedClause: '6.2.3.4',
    });

    const results = [
      { clauseNumber: '6.2.3.3', docId: 'doc_java' },
      { clauseNumber: '6.2.3.3', docId: 'doc_java' },
      { clauseNumber: '6.2.3.3', docId: 'doc_java' },
      { clauseNumber: '6.2.3.3', docId: 'doc_java' },
      { clauseNumber: '6.2.3.3', docId: 'doc_java' },
      { clauseNumber: '6.2.3.4', docId: 'doc_java' },
    ];

    assert.equal(findFirstRelevantRank(results, expected, docTypeMap, 5), null);
    assert.equal(findFirstRelevantRank(results, expected, docTypeMap, 6), 6);
  });
});

describe('recallAtK', () => {
  it('returns 1 only when rank is within K', () => {
    assert.equal(recallAtK(3, 5), 1);
    assert.equal(recallAtK(6, 5), 0);
    assert.equal(recallAtK(null, 5), 0);
  });
});

describe('reciprocalRank', () => {
  it('returns zero when no hit', () => {
    assert.equal(reciprocalRank(null), 0);
    assert.equal(reciprocalRank(2), 0.5);
  });
});

describe('inferQueryType', () => {
  it('infers from id and clause depth', () => {
    assert.equal(
      inferQueryType(gq({ id: 'java-clause-exact', query: '6.2.3.4', expectedClause: '6.2.3.4' })),
      'clause-exact',
    );
    assert.equal(
      inferQueryType(gq({ id: 'java-sql', query: 'sql', expectedClause: '6.2.3.4' })),
      'semantic-specific',
    );
    assert.equal(
      inferQueryType(gq({ id: 'java-input', query: 'input', expectedClause: '6.2.3' })),
      'semantic-broad',
    );
  });
});

describe('isPrimaryEvalQuery', () => {
  it('excludes semantic-broad from pass/fail gate', () => {
    assert.equal(
      isPrimaryEvalQuery(gq({ id: 'java-input', query: 'input', expectedClause: '6.2.3' })),
      false,
    );
    assert.equal(
      isPrimaryEvalQuery(gq({ id: 'java-sql', query: 'sql', expectedClause: '6.2.3.4' })),
      true,
    );
  });
});

describe('percentile', () => {
  it('computes ordered percentile', () => {
    assert.equal(percentile([10, 20, 30, 40], 50), 20);
    assert.equal(percentile([], 50), 0);
  });
});

describe('average', () => {
  it('returns mean', () => {
    assert.equal(average([1, 3]), 2);
    assert.equal(average([]), 0);
  });
});
