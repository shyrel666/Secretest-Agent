/**
 * 向量存储 — JSON 文件 + 内存余弦相似度搜索
 *
 * 存储结构:
 *   data/knowledge/{dataset}/meta.json          — 数据集元信息
 *   data/knowledge/{dataset}/docs/{docId}.json  — 单个文档(含 chunks + embeddings)
 */

import fs from 'fs/promises';
import path from 'path';

// ——— 类型定义 ———

export interface ChunkRecord {
  id: string;
  content: string;
  embedding: number[];
}

export interface DocumentRecord {
  id: string;
  filename: string;
  title: string;
  type: string;
  importedAt: string;
  chunkCount: number;
  chunks: ChunkRecord[];
}

export interface DocumentMeta {
  id: string;
  filename: string;
  title: string;
  type: string;
  importedAt: string;
  chunkCount: number;
}

export interface SearchResult {
  content: string;
  score: number;
  docId: string;
}

// ——— 路径工具 ———

/** 数据根目录 (项目根/data/knowledge) */
function dataRoot(): string {
  return path.join(process.cwd(), 'data', 'knowledge');
}

function datasetDir(dataset: string): string {
  return path.join(dataRoot(), sanitizeName(dataset));
}

function docsDir(dataset: string): string {
  return path.join(datasetDir(dataset), 'docs');
}

function docFilePath(dataset: string, docId: string): string {
  return path.join(docsDir(dataset), `${sanitizeName(docId)}.json`);
}

/** 防止路径穿越 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

// ——— 存储操作 ———

/** 确保目录存在 */
async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 保存文档（含 chunks 和 embeddings）
 */
export async function addDocument(
  dataset: string,
  doc: DocumentRecord,
): Promise<void> {
  const dir = docsDir(dataset);
  await ensureDir(dir);
  const filePath = docFilePath(dataset, doc.id);
  await fs.writeFile(filePath, JSON.stringify(doc), 'utf-8');
}

/**
 * 列出数据集中所有文档的元信息（不加载 embeddings）
 */
export async function listDocuments(
  dataset: string,
): Promise<DocumentMeta[]> {
  const dir = docsDir(dataset);
  try {
    const files = await fs.readdir(dir);
    const metas: DocumentMeta[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), 'utf-8');
        const doc: DocumentRecord = JSON.parse(raw);
        metas.push({
          id: doc.id,
          filename: doc.filename,
          title: doc.title,
          type: doc.type,
          importedAt: doc.importedAt,
          chunkCount: doc.chunkCount,
        });
      } catch {
        // 跳过损坏文件
      }
    }

    return metas.sort(
      (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime(),
    );
  } catch {
    // 目录不存在
    return [];
  }
}

/**
 * 删除文档
 */
export async function deleteDocument(
  dataset: string,
  docId: string,
): Promise<boolean> {
  const filePath = docFilePath(dataset, docId);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 语义搜索 — 加载所有文档的 chunks，计算余弦相似度，返回 top-K
 */
export async function searchSimilar(
  dataset: string,
  queryEmbedding: number[],
  topK: number = 5,
  threshold: number = 0.3,
  typeFilter?: string[],
): Promise<SearchResult[]> {
  const dir = docsDir(dataset);

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const scored: SearchResult[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8');
      const doc: DocumentRecord = JSON.parse(raw);

      if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(doc.type)) {
        continue;
      }

      for (const chunk of doc.chunks) {
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (score >= threshold) {
          scored.push({
            content: chunk.content,
            score,
            docId: doc.id,
          });
        }
      }
    } catch {
      // 跳过损坏文件
    }
  }

  // 按相似度降序，取 top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ——— 数学工具 ———

/** 余弦相似度 */
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
  return denom === 0 ? 0 : dot / denom;
}
