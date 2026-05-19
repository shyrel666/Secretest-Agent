/**
 * Centralized retrieval tuning — override at runtime via setRetrievalConfig().
 */

export interface RetrievalConfig {
  /** RRF constant k (Cormack et al.) */
  rrfK: number;
  /** Extra RRF weight for clause match list */
  clauseRrfWeight: number;
  /** Minimum raw RRF score to keep a candidate in fusion */
  rrfMinScore: number;
  /** candidatePool = max(topK * multiplier, minCandidatePool) */
  candidatePoolMultiplier: number;
  minCandidatePool: number;
  /** Max candidates passed to optional reranker */
  rerankPoolSize: number;
  /**
   * Bi-encoder re-embedding rerank duplicates vector scoring and doubles API cost.
   * Keep false until a cross-encoder / dedicated rerank API is wired.
   */
  enableEmbeddingRerank: boolean;
  /** Adjacent chunks on each side of a hit */
  contextWindowSize: number;
  /** Hard cap after context expansion (avoids blowing LLM context) */
  maxResultsAfterContextExpand: number;
  embedCacheMaxEntries: number;
  embedCacheTtlMs: number;
  defaultEmbeddingModel: string;
  /** Default minimum fused score for search() and hybridSearch() */
  defaultSearchThreshold: number;
  /** KNN/FTS over-fetch multiplier when no doc-type filter is applied */
  sqlFetchMultiplier: number;
  /** KNN/FTS over-fetch multiplier when doc-type filter is applied */
  sqlFetchMultiplierWithTypeFilter: number;
  /** Upper bound for iterative KNN/FTS over-fetch with type filters */
  maxSqlFetchLimit: number;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  rrfK: 60,
  clauseRrfWeight: 2,
  rrfMinScore: 0.02,
  candidatePoolMultiplier: 4,
  minCandidatePool: 20,
  rerankPoolSize: 20,
  enableEmbeddingRerank: false,
  contextWindowSize: 1,
  maxResultsAfterContextExpand: 12,
  embedCacheMaxEntries: 200,
  embedCacheTtlMs: 10 * 60 * 1000,
  defaultEmbeddingModel: 'text-embedding-v3',
  defaultSearchThreshold: 0.25,
  sqlFetchMultiplier: 3,
  sqlFetchMultiplierWithTypeFilter: 10,
  maxSqlFetchLimit: 500,
};

let activeConfig: RetrievalConfig = { ...DEFAULT_RETRIEVAL_CONFIG };

export function getRetrievalConfig(): RetrievalConfig {
  return activeConfig;
}

export function setRetrievalConfig(overrides: Partial<RetrievalConfig>): void {
  activeConfig = { ...activeConfig, ...overrides };
}

export function resetRetrievalConfig(): void {
  activeConfig = { ...DEFAULT_RETRIEVAL_CONFIG };
}

export function resolveCandidatePoolSize(topK: number, config = getRetrievalConfig()): number {
  return Math.max(topK * config.candidatePoolMultiplier, config.minCandidatePool);
}

export function resolveMaxExpandedResults(topK: number, config = getRetrievalConfig()): number {
  return Math.min(
    config.maxResultsAfterContextExpand,
    topK + topK * config.contextWindowSize * 2,
  );
}

export function resolveSqlFetchLimit(
  topK: number,
  typeFilter?: string[],
  config = getRetrievalConfig(),
): number {
  const multiplier = typeFilter?.length
    ? config.sqlFetchMultiplierWithTypeFilter
    : config.sqlFetchMultiplier;
  return Math.min(topK * multiplier, config.maxSqlFetchLimit);
}
