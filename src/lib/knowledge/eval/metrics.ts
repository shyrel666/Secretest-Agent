/**
 * Retrieval evaluation metrics — shared by eval script and unit tests.
 */

export type GoldenQueryType =
  | 'semantic-specific'
  | 'semantic-broad'
  | 'clause-exact'
  | 'clause-prefix';

export interface GoldenQuery {
  id: string;
  query: string;
  expectedClause: string;
  standardType?: string;
  queryType?: GoldenQueryType;
}

export interface EvalResultRow {
  clauseNumber?: string;
  docId: string;
}

export function inferQueryType(gq: GoldenQuery): GoldenQueryType {
  if (gq.queryType) return gq.queryType;

  if (gq.id.includes('clause-exact')) return 'clause-exact';
  if (gq.id.includes('clause-prefix')) return 'clause-prefix';

  const depth = gq.expectedClause.split('.').length;
  return depth >= 4 ? 'semantic-specific' : 'semantic-broad';
}

export function isClauseMatch(
  clauseNumber: string,
  expectedClause: string,
): boolean {
  return (
    clauseNumber === expectedClause
    || clauseNumber.startsWith(`${expectedClause}.`)
  );
}

export function isRelevant(
  clauseNumber: string | undefined,
  docType: string | undefined,
  expected: GoldenQuery,
  docTypeMap: Map<string, string>,
  docId: string,
): boolean {
  if (!clauseNumber) return false;

  if (!isClauseMatch(clauseNumber, expected.expectedClause)) {
    return false;
  }

  const resolvedType = docType || docTypeMap.get(docId);
  if (expected.standardType) {
    if (!resolvedType || resolvedType !== expected.standardType) {
      return false;
    }
  }

  return true;
}

export function findFirstRelevantRank(
  results: EvalResultRow[],
  expected: GoldenQuery,
  docTypeMap: Map<string, string>,
  topK: number,
): number | null {
  const ranked = results.slice(0, topK);

  for (let i = 0; i < ranked.length; i++) {
    const item = ranked[i];
    if (isRelevant(item.clauseNumber, undefined, expected, docTypeMap, item.docId)) {
      return i + 1;
    }
  }

  return null;
}

export function recallAtK(firstRank: number | null, k: number): number {
  if (firstRank === null) return 0;
  return firstRank <= k ? 1 : 0;
}

export function reciprocalRank(rank: number | null): number {
  if (rank === null) return 0;
  return 1 / rank;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Primary metrics drive pass/fail; broad/clause groups are reported separately. */
export function isPrimaryEvalQuery(gq: GoldenQuery): boolean {
  const type = inferQueryType(gq);
  return type === 'semantic-specific' || type === 'clause-exact' || type === 'clause-prefix';
}
