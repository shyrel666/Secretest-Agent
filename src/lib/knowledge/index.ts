/**
 * LocalKnowledgeBase — 内建知识库统一封装
 *
 * 整合 结构感知分块器 + embedder + SQLite向量存储 + 混合检索，
 * 提供与原 KnowledgeAgent 兼容的接口。
 */

import path from 'path';
import fs from 'fs';
import { chunkText, type StructuredChunk } from './chunker';
import { embedTextsWithUsage } from './embedder';
import {
  addDocument as sqliteAddDoc,
  listDocuments as sqliteListDocs,
  deleteDocument as sqliteDeleteDoc,
  getDocumentSections as sqliteGetSections,
  getChunksByClausePrefix as sqliteGetChunksByPrefix,
  isReadableKnowledgeTitle,
  type DocumentMeta,
  type DocumentRecord,
  type ChunkRecord,
  type DocumentSection,
} from './sqlite-store';
import { hybridSearch, type HybridSearchOptions } from './hybrid-search';

// 默认数据集名称（与原 SDK 保持一致）
const DEFAULT_DATASET = 'vulnerability_audit_standards';
const DOCUMENTS_CACHE_TTL_MS = 15_000;
const SEARCH_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
}

const documentsCache = new Map<string, CacheEntry<DocumentMeta[]>>();
const searchCache = new Map<string, CacheEntry<SearchResult>>();

export interface KnowledgeConfig {
  apiKey: string;
  modelBaseUrl: string;
  embeddingModel?: string;
}

export interface ImportResult {
  success: boolean;
  docId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated: boolean;
  };
  error?: string;
}

export interface SearchResultItem {
  content: string;
  score: number;
  docId: string;
  /** 章节路径 */
  sectionPath?: string;
  /** 条款编号 */
  clauseNumber?: string;
  /** chunk 类型 */
  chunkType?: string;
}

export interface SearchResult {
  success: boolean;
  results: SearchResultItem[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimated: boolean;
  };
  error?: string;
}

/**
 * 生成文档 ID（时间戳 + 随机后缀）
 */
function generateDocId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `doc_${ts}_${rand}`;
}

function buildDocumentsCacheKey(dataset?: string): string {
  return dataset || DEFAULT_DATASET;
}

function buildSearchCacheKey(params: {
  query: string;
  config: KnowledgeConfig;
  topK: number;
  threshold: number;
  dataset?: string;
  typeFilter?: string[];
}): string {
  return JSON.stringify({
    dataset: params.dataset || DEFAULT_DATASET,
    query: params.query,
    topK: params.topK,
    threshold: params.threshold,
    typeFilter: [...(params.typeFilter || [])].sort(),
    modelBaseUrl: params.config.modelBaseUrl,
    embeddingModel: params.config.embeddingModel || '',
  });
}

function getZeroUsage() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimated: false,
  };
}

function cloneSearchResult(result: SearchResult, fromCache: boolean): SearchResult {
  return {
    ...result,
    results: result.results.map((item) => ({ ...item })),
    usage: fromCache ? getZeroUsage() : result.usage,
  };
}

export function invalidateKnowledgeCaches(): void {
  documentsCache.clear();
  searchCache.clear();
}

/**
 * 导入文本到知识库
 */
export async function importText(
  content: string,
  config: KnowledgeConfig,
  metadata?: { filename?: string; title?: string; type?: string },
  dataset?: string,
): Promise<ImportResult> {
  try {
    if (!config.apiKey || !config.modelBaseUrl) {
      return {
        success: false,
        error: '请先在「设置」页面配置 API Key 和模型接口地址',
      };
    }

    // 1. 结构感知分块
    const structuredChunks: StructuredChunk[] = chunkText(content, {
      maxChunkSize: 1200,
      overlap: 80,
    });
    if (structuredChunks.length === 0) {
      return { success: false, error: '文本内容为空，无法分块' };
    }

    // 2. 批量 embedding（提取纯文本）
    const texts = structuredChunks.map((c) => c.content);
    const embeddingResult = await embedTextsWithUsage(texts, {
      apiKey: config.apiKey,
      modelBaseUrl: config.modelBaseUrl,
      embeddingModel: config.embeddingModel,
    });

    // 3. 组装文档记录（携带结构化元数据）
    const docId = generateDocId();
    const chunkRecords: ChunkRecord[] = structuredChunks.map((sc, i) => ({
      id: `${docId}_chunk_${i}`,
      content: sc.content,
      embedding: embeddingResult.embeddings[i],
      sectionPath: sc.sectionPath,
      clauseNumber: sc.clauseNumber,
      chunkType: sc.chunkType,
    }));

    const doc: DocumentRecord = {
      id: docId,
      filename: metadata?.filename || 'unknown',
      title: metadata?.title || metadata?.filename || 'unknown',
      type: metadata?.type || 'unknown',
      importedAt: new Date().toISOString(),
      chunkCount: chunkRecords.length,
      chunks: chunkRecords,
    };

    // 4. 存储到 SQLite（向量索引 + FTS5 全文索引）
    sqliteAddDoc(dataset || DEFAULT_DATASET, doc);
    invalidateKnowledgeCaches();

    return {
      success: true,
      docId,
      usage: {
        promptTokens: embeddingResult.usage.promptTokens,
        completionTokens: 0,
        totalTokens: embeddingResult.usage.totalTokens,
        estimated: false,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '导入过程中出现未知错误',
    };
  }
}

/**
 * 混合检索知识库（向量语义 + 关键词BM25 + 条款精确匹配）
 */
export async function search(
  query: string,
  config: KnowledgeConfig,
  topK: number = 5,
  threshold: number = 0.25,
  dataset?: string,
  typeFilter?: string[],
): Promise<SearchResult> {
  try {
    if (!config.apiKey || !config.modelBaseUrl) {
      return {
        success: false,
        results: [],
        error: '请先在「设置」页面配置 API Key 和模型接口地址',
      };
    }

    const cacheKey = buildSearchCacheKey({
      query,
      config,
      topK,
      threshold,
      dataset,
      typeFilter,
    });
    const now = Date.now();
    const cached = searchCache.get(cacheKey);

    if (cached?.value && cached.expiresAt > now) {
      return cloneSearchResult(cached.value, true);
    }

    if (cached?.promise && cached.expiresAt > now) {
      const result = await cached.promise;
      return cloneSearchResult(result, true);
    }

    const pending = (async (): Promise<SearchResult> => {
      // 1. 获取查询文本的 embedding
      const embeddingResult = await embedTextsWithUsage([query], {
        apiKey: config.apiKey,
        modelBaseUrl: config.modelBaseUrl,
        embeddingModel: config.embeddingModel,
      });
      const queryEmbedding = embeddingResult.embeddings[0];

      // 2. 混合检索（向量 + 关键词 + 条款号融合）
      const searchOptions: HybridSearchOptions = {
        topK,
        threshold,
        typeFilter,
        alpha: 0.7,
        expandContext: true,
        contextWindowSize: 1,
      };

      const rawResults = hybridSearch(
        queryEmbedding,
        query,
        dataset || DEFAULT_DATASET,
        searchOptions,
      );

      // 3. 转换为外部接口格式
      const results: SearchResultItem[] = rawResults.map((r) => ({
        content: r.content,
        score: r.score,
        docId: r.docId,
        sectionPath: r.sectionPath,
        clauseNumber: r.clauseNumber,
        chunkType: r.chunkType,
      }));

      return {
        success: true,
        results,
        usage: {
          promptTokens: embeddingResult.usage.promptTokens,
          completionTokens: 0,
          totalTokens: embeddingResult.usage.totalTokens,
          estimated: false,
        },
      };
    })();

    searchCache.set(cacheKey, {
      expiresAt: now + SEARCH_CACHE_TTL_MS,
      promise: pending,
    });

    try {
      const result = await pending;
      searchCache.set(cacheKey, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        value: result,
      });
      return cloneSearchResult(result, false);
    } catch (error) {
      searchCache.delete(cacheKey);
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      results: [],
      error: error instanceof Error ? error.message : '搜索过程中出现未知错误',
    };
  }
}

/**
 * 列出已导入文档
 */
export async function listDocuments(
  dataset?: string,
): Promise<DocumentMeta[]> {
  const cacheKey = buildDocumentsCacheKey(dataset);
  const now = Date.now();
  const cached = documentsCache.get(cacheKey);

  if (cached?.value && cached.expiresAt > now) {
    return cached.value.map((doc) => ({ ...doc }));
  }

  if (cached?.promise && cached.expiresAt > now) {
    const docs = await cached.promise;
    return docs.map((doc) => ({ ...doc }));
  }

  const pending = Promise.resolve(sqliteListDocs(dataset || DEFAULT_DATASET));
  documentsCache.set(cacheKey, {
    expiresAt: now + DOCUMENTS_CACHE_TTL_MS,
    promise: pending,
  });

  try {
    const docs = await pending;
    documentsCache.set(cacheKey, {
      expiresAt: Date.now() + DOCUMENTS_CACHE_TTL_MS,
      value: docs,
    });
    return docs.map((doc) => ({ ...doc }));
  } catch (error) {
    documentsCache.delete(cacheKey);
    throw error;
  }
}

/**
 * 删除文档
 */
export async function deleteDocument(
  docId: string,
  dataset?: string,
): Promise<{ success: boolean }> {
  const ds = dataset || DEFAULT_DATASET;
  const ok = sqliteDeleteDoc(ds, docId);

  // 同时清理遗留的 JSON 文件
  const sanitized = docId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const jsonPath = path.join(
    process.cwd(), 'data', 'knowledge',
    ds.replace(/[^a-zA-Z0-9_\-]/g, '_'), 'docs',
    `${sanitized}.json`,
  );
  try {
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
    }
  } catch {
    // 文件不存在或无权限，忽略
  }

  if (ok) {
    invalidateKnowledgeCaches();
  }

  return { success: ok };
}

/**
 * 获取文档章节结构（学习中心用）
 */
export function getDocumentSections(
  docType?: string,
  dataset?: string,
): DocumentSection[] {
  return sqliteGetSections(dataset || DEFAULT_DATASET, docType);
}

/**
 * 按条款前缀获取所有 chunks（章节内容生成用）
 */
export function getChunksByClausePrefix(
  clausePrefix: string,
  docType?: string,
  dataset?: string,
) {
  return sqliteGetChunksByPrefix(dataset || DEFAULT_DATASET, clausePrefix, docType);
}

export { isReadableKnowledgeTitle };
export type { DocumentMeta, DocumentSection };
