/**
 * Optional rerank stage — disabled by default (bi-encoder re-embed duplicates vector scoring).
 */

import { embedTextsWithUsage } from './embedder';
import { getRetrievalConfig } from './retrieval-config';

export interface RerankCandidate {
  content: string;
  score: number;
  docId: string;
  sectionPath?: string;
  clauseNumber?: string;
  chunkType?: string;
  chunkId?: string;
}

interface RerankConfig {
  apiKey: string;
  modelBaseUrl: string;
  embeddingModel?: string;
}

export interface RerankResult {
  results: RerankCandidate[];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/** Keep top-K by existing hybrid scores (no extra API calls). */
export function selectTopByScore(
  candidates: RerankCandidate[],
  topK: number,
): RerankResult {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return {
    results: sorted.slice(0, topK),
    usage: { promptTokens: 0, totalTokens: 0 },
  };
}

/**
 * Rerank candidates. Uses embedding cosine only when enableEmbeddingRerank is true.
 */
export async function rerankResults(
  _query: string,
  queryEmbedding: number[],
  candidates: RerankCandidate[],
  config: RerankConfig,
  topK: number,
): Promise<RerankResult> {
  if (candidates.length <= 1) {
    return selectTopByScore(candidates, topK);
  }

  const { enableEmbeddingRerank, rerankPoolSize } = getRetrievalConfig();

  if (!enableEmbeddingRerank) {
    return selectTopByScore(candidates, topK);
  }

  const pool = candidates.slice(0, rerankPoolSize);
  const texts = pool.map((c) => {
    const prefix = c.sectionPath ? `[${c.sectionPath}] ` : '';
    return `${prefix}${c.content}`.slice(0, 512);
  });

  try {
    const embedResult = await embedTextsWithUsage(texts, {
      apiKey: config.apiKey,
      modelBaseUrl: config.modelBaseUrl,
      embeddingModel: config.embeddingModel,
    });

    const scored = pool.map((item, i) => ({
      item,
      score: cosineSimilarity(queryEmbedding, embedResult.embeddings[i]),
    }));

    scored.sort((a, b) => b.score - a.score);

    return {
      results: scored.slice(0, topK).map((s) => ({
        ...s.item,
        score: s.score,
        chunkId: s.item.chunkId,
      })),
      usage: {
        promptTokens: embedResult.usage.promptTokens,
        totalTokens: embedResult.usage.totalTokens,
      },
    };
  } catch (error) {
    console.warn(
      '[knowledge/reranker] embedding rerank failed, falling back to hybrid scores:',
      error instanceof Error ? error.message : error,
    );
    return selectTopByScore(pool, topK);
  }
}
