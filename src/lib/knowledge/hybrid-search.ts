/**
 * 混合检索引擎 — 向量语义搜索 + FTS5 关键词搜索 + 条款精确匹配
 *
 * 三路检索融合策略：
 * 1. 向量检索（语义相似度）— 权重 α
 * 2. 关键词检索（BM25）— 权重 1-α
 * 3. 条款号精确匹配 — 额外加分
 * 4. 上下文窗口扩展 — 命中 chunk 自动拉取相邻 chunk
 */

import {
  searchByVector,
  searchByKeyword,
  searchByClauseNumber,
  getAdjacentChunks,
  type SearchResult,
} from './sqlite-store';

export interface HybridSearchOptions {
  /** 向量/关键词权重比，默认 0.7（向量占 70%） */
  alpha?: number;
  /** 返回结果数量 */
  topK?: number;
  /** 最低分数阈值 */
  threshold?: number;
  /** 文档类型过滤 */
  typeFilter?: string[];
  /** 是否启用上下文窗口扩展，默认 true */
  expandContext?: boolean;
  /** 上下文窗口大小（前后各多少个 chunk），默认 1 */
  contextWindowSize?: number;
}

/**
 * 混合检索：融合向量搜索 + 关键词搜索 + 条款精确匹配。
 */
export function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  dataset: string,
  options: HybridSearchOptions = {},
): SearchResult[] {
  const {
    alpha = 0.7,
    topK = 5,
    threshold = 0.25,
    typeFilter,
    expandContext = true,
    contextWindowSize = 1,
  } = options;

  const candidateK = topK * 3;

  // ——— 1. 向量语义搜索 ———
  const vectorResults = searchByVector(dataset, queryEmbedding, candidateK, typeFilter);

  // ——— 2. 关键词搜索 ———
  const keywordResults = searchByKeyword(dataset, queryText, candidateK, typeFilter);

  // ——— 3. 条款号精确匹配 ———
  const clauseNumbers = extractClauseNumbers(queryText);
  const clauseResults: SearchResult[] = [];
  for (const cn of clauseNumbers) {
    clauseResults.push(...searchByClauseNumber(cn, typeFilter));
  }

  // ——— 4. 融合评分 ———
  const scoreMap = new Map<string, {
    result: SearchResult;
    vectorScore: number;
    keywordScore: number;
    clauseMatch: boolean;
  }>();

  // 归一化向量搜索分数
  const maxVecScore = vectorResults.length > 0
    ? Math.max(...vectorResults.map((r) => r.score))
    : 1;

  for (const r of vectorResults) {
    const normScore = maxVecScore > 0 ? r.score / maxVecScore : 0;
    scoreMap.set(r.chunkId, {
      result: r,
      vectorScore: normScore,
      keywordScore: 0,
      clauseMatch: false,
    });
  }

  // 归一化关键词搜索分数
  const maxKwScore = keywordResults.length > 0
    ? Math.max(...keywordResults.map((r) => r.score))
    : 1;

  for (const r of keywordResults) {
    const normScore = maxKwScore > 0 ? r.score / maxKwScore : 0;
    const existing = scoreMap.get(r.chunkId);
    if (existing) {
      existing.keywordScore = normScore;
    } else {
      scoreMap.set(r.chunkId, {
        result: r,
        vectorScore: 0,
        keywordScore: normScore,
        clauseMatch: false,
      });
    }
  }

  // 标记条款精确匹配
  for (const r of clauseResults) {
    const existing = scoreMap.get(r.chunkId);
    if (existing) {
      existing.clauseMatch = true;
    } else {
      scoreMap.set(r.chunkId, {
        result: r,
        vectorScore: 0,
        keywordScore: 0,
        clauseMatch: true,
      });
    }
  }

  // 计算最终分数
  const CLAUSE_BONUS = 0.15;
  const scored: Array<{ result: SearchResult; finalScore: number }> = [];

  for (const entry of scoreMap.values()) {
    let finalScore = alpha * entry.vectorScore + (1 - alpha) * entry.keywordScore;
    if (entry.clauseMatch) {
      finalScore += CLAUSE_BONUS;
    }
    finalScore = Math.min(1, finalScore);

    if (finalScore >= threshold) {
      scored.push({
        result: { ...entry.result, score: finalScore },
        finalScore,
      });
    }
  }

  // 排序
  scored.sort((a, b) => b.finalScore - a.finalScore);
  let topResults = scored.slice(0, topK).map((s) => s.result);

  // ——— 5. 上下文窗口扩展 ———
  if (expandContext && contextWindowSize > 0 && topResults.length > 0) {
    topResults = expandWithContext(topResults, contextWindowSize);
  }

  return topResults;
}

/**
 * 提取查询中的条款编号（如 "5.3.4"、"A.1"）。
 */
function extractClauseNumbers(query: string): string[] {
  const matches = query.match(/\b(\d+(?:\.\d+){1,3})\b/g) || [];
  const appendixMatches = query.match(/\b([A-Z]\.\d+(?:\.\d+)*)\b/g) || [];
  return [...new Set([...matches, ...appendixMatches])];
}

/**
 * 用上下文窗口扩展搜索结果：
 * 对于每个命中的 chunk，获取其前后相邻 chunk，去重后拼接。
 */
function expandWithContext(
  results: SearchResult[],
  windowSize: number,
): SearchResult[] {
  const seen = new Set(results.map((r) => r.chunkId));
  const expanded: SearchResult[] = [...results];

  for (const result of results) {
    const adjacent = getAdjacentChunks(result.chunkId, windowSize);
    for (const adj of adjacent) {
      if (!seen.has(adj.chunkId)) {
        seen.add(adj.chunkId);
        // 上下文扩展的 chunk 分数设为原 chunk 的一半
        expanded.push({ ...adj, score: result.score * 0.5 });
      }
    }
  }

  return expanded;
}
