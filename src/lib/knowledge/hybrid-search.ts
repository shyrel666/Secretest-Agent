/**
 * Hybrid retrieval — vector KNN + FTS5 BM25 + clause prefix match, fused via RRF.
 */

import {
  searchByVector,
  searchByKeyword,
  getChunksByClausePrefix,
  getAdjacentChunks,
  type SearchResult,
} from './sqlite-store';
import { getRetrievalConfig } from './retrieval-config';

export interface HybridSearchOptions {
  /** @deprecated RRF ignores alpha */
  alpha?: number;
  /** Final result count (not candidate pool size) */
  resultTopK?: number;
  /** Minimum normalized score 0–1 after fusion */
  threshold?: number;
  typeFilter?: string[];
  expandContext?: boolean;
  contextWindowSize?: number;
  candidateK?: number;
}

/**
 * Reciprocal Rank Fusion across ranked lists.
 */
export function computeRrfScore(
  ranks: Array<{ rank: number; weight?: number }>,
  rrfK?: number,
): number {
  const k = rrfK ?? getRetrievalConfig().rrfK;
  return ranks.reduce((sum, { rank, weight = 1 }) => {
    return sum + weight * (1 / (k + rank));
  }, 0);
}

/**
 * Extract clause numbers from query (e.g. "6.2.3.4", "A.1", "第 6.2.3 条").
 * Filters GB/T standard numbers and bare years.
 */
export function extractClauseNumbers(query: string): string[] {
  const results = new Set<string>();

  for (const match of query.matchAll(/第\s*(\d+(?:\.\d+){1,4})\s*条/g)) {
    if (match[1]) results.add(match[1]);
  }

  for (const match of query.matchAll(/\b([A-Z]\.\d+(?:\.\d+)*)\b/gi)) {
    if (match[1]) results.add(match[1].toUpperCase());
  }

  for (const match of query.matchAll(/\b([1-9]\d*(?:\.\d+){1,4})\b/g)) {
    const num = match[1];
    const index = match.index ?? 0;
    const before = query.slice(Math.max(0, index - 16), index);
    if (/GB\/T\s*[\d-]*$/i.test(before)) continue;
    results.add(num);
  }

  return [...results];
}

function searchClausesByPrefix(
  dataset: string,
  clauseNumbers: string[],
  typeFilter?: string[],
): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const cn of clauseNumbers) {
    const chunks = getChunksByClausePrefix(
      dataset,
      cn,
      typeFilter?.length ? typeFilter : undefined,
    );
    for (const chunk of chunks) {
      if (seen.has(chunk.chunkId)) continue;
      seen.add(chunk.chunkId);
      merged.push({ ...chunk, score: 1 });
    }
  }

  return merged;
}

/**
 * Hybrid search with RRF fusion and optional context expansion.
 */
export function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  dataset: string,
  options: HybridSearchOptions = {},
): SearchResult[] {
  const cfg = getRetrievalConfig();
  const {
    resultTopK = 5,
    threshold = cfg.defaultSearchThreshold,
    typeFilter,
    expandContext = true,
    contextWindowSize = cfg.contextWindowSize,
    candidateK,
  } = options;

  const poolK = candidateK ?? Math.max(resultTopK * cfg.candidatePoolMultiplier, cfg.minCandidatePool);

  const clauseNumbers = extractClauseNumbers(queryText);
  const clauseResults = clauseNumbers.length > 0
    ? searchClausesByPrefix(dataset, clauseNumbers, typeFilter)
    : [];

  if (clauseNumbers.length > 0 && clauseResults.length > 0) {
    const clauseTop = clauseResults
      .slice(0, resultTopK)
      .map((r) => ({ ...r, score: 1 }));

    return expandContext && contextWindowSize > 0
      ? expandSearchContext(clauseTop, contextWindowSize, resolveMaxExpanded(resultTopK))
      : clauseTop;
  }

  const vectorResults = searchByVector(dataset, queryEmbedding, poolK, typeFilter);
  const keywordResults = searchByKeyword(dataset, queryText, poolK, typeFilter);

  const rankMap = new Map<string, {
    result: SearchResult;
    ranks: Array<{ rank: number; weight?: number }>;
  }>();

  const addToRankMap = (results: SearchResult[], weight = 1) => {
    results.forEach((r, index) => {
      const rank = index + 1;
      const existing = rankMap.get(r.chunkId);
      if (existing) {
        existing.ranks.push({ rank, weight });
        if (r.score > existing.result.score) {
          existing.result = r;
        }
      } else {
        rankMap.set(r.chunkId, {
          result: r,
          ranks: [{ rank, weight }],
        });
      }
    });
  };

  addToRankMap(vectorResults, 1);
  addToRankMap(keywordResults, 1);
  addToRankMap(clauseResults, cfg.clauseRrfWeight);

  const scored: Array<{ result: SearchResult; rrfScore: number }> = [];

  for (const entry of rankMap.values()) {
    const rrfScore = computeRrfScore(entry.ranks, cfg.rrfK);
    if (rrfScore >= cfg.rrfMinScore) {
      scored.push({
        result: { ...entry.result, score: rrfScore },
        rrfScore,
      });
    }
  }

  scored.sort((a, b) => b.rrfScore - a.rrfScore);

  const maxScore = scored.length > 0 ? scored[0].rrfScore : 1;
  let topResults = scored
    .slice(0, poolK)
    .map((s) => ({
      ...s.result,
      score: maxScore > 0 ? s.rrfScore / maxScore : s.rrfScore,
    }))
    .filter((r) => r.score >= threshold);

  if (clauseResults.length > 0) {
    const seen = new Set(topResults.map((r) => r.chunkId));
    const boosted = clauseResults
      .filter((r) => !seen.has(r.chunkId))
      .map((r) => ({ ...r, score: 1 }));
    topResults = [...boosted, ...topResults]
      .filter((r) => r.score >= threshold)
      .slice(0, poolK);
  }

  topResults = topResults.slice(0, resultTopK);

  if (expandContext && contextWindowSize > 0 && topResults.length > 0) {
    topResults = expandSearchContext(
      topResults,
      contextWindowSize,
      resolveMaxExpanded(resultTopK),
    );
  }

  return topResults;
}

function resolveMaxExpanded(resultTopK: number): number {
  const cfg = getRetrievalConfig();
  return Math.min(
    cfg.maxResultsAfterContextExpand,
    resultTopK + resultTopK * cfg.contextWindowSize * 2,
  );
}

/** Expand results with adjacent chunks; hard-capped by maxTotal. */
export function expandSearchContext(
  results: SearchResult[],
  windowSize: number,
  maxTotal?: number,
): SearchResult[] {
  const cap = maxTotal ?? getRetrievalConfig().maxResultsAfterContextExpand;
  const seen = new Set(results.map((r) => r.chunkId));
  const expanded: SearchResult[] = [...results];

  for (const result of results) {
    if (expanded.length >= cap) break;

    const adjacent = getAdjacentChunks(result.chunkId, windowSize);
    for (const adj of adjacent) {
      if (expanded.length >= cap) break;
      if (!seen.has(adj.chunkId)) {
        seen.add(adj.chunkId);
        expanded.push({ ...adj, score: result.score * 0.5 });
      }
    }
  }

  return expanded;
}
