/**
 * LRU cache for query embeddings to reduce API calls.
 */

import { getRetrievalConfig } from './retrieval-config';

interface CacheEntry {
  embedding: number[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function buildEmbedCacheKey(
  query: string,
  modelBaseUrl: string,
  embeddingModel?: string,
): string {
  const { defaultEmbeddingModel } = getRetrievalConfig();
  return `${modelBaseUrl}::${embeddingModel || defaultEmbeddingModel}::${query.trim()}`;
}

function touchEntry(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
}

export function getCachedEmbedding(key: string): number[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  touchEntry(key, entry);
  return entry.embedding;
}

export function setCachedEmbedding(key: string, embedding: number[]): void {
  const { embedCacheMaxEntries, embedCacheTtlMs } = getRetrievalConfig();

  if (cache.size >= embedCacheMaxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, {
    embedding,
    expiresAt: Date.now() + embedCacheTtlMs,
  });
}

export function clearEmbedCache(): void {
  cache.clear();
}
