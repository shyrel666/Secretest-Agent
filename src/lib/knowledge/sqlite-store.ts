/**
 * SQLite 向量存储 — 基于 better-sqlite3 + sqlite-vec
 *
 * 替代原 JSON 文件存储，提供：
 * - 结构化 SQL 存储（documents + chunks 表）
 * - sqlite-vec 向量索引（近似最近邻搜索）
 * - FTS5 全文搜索索引（关键词检索）
 * - 扩展的 chunk 元数据（sectionPath, clauseNumber, chunkType）
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import fs from 'fs';
import { buildFtsQuery } from './chinese-tokenizer';
import { getRetrievalConfig, resolveSqlFetchLimit } from './retrieval-config';

// ——— 类型定义 ———

export interface ChunkRecord {
  id: string;
  content: string;
  embedding: number[];
  /** 章节路径，如 "5.数据处理 > 5.3.SQL注入" */
  sectionPath: string;
  /** 条款编号，如 "5.3.4" */
  clauseNumber: string;
  /** chunk 类型 */
  chunkType: 'clause' | 'example' | 'appendix' | 'definition' | 'general';
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
  /** 章节路径 */
  sectionPath: string;
  /** 条款编号 */
  clauseNumber: string;
  /** chunk 类型 */
  chunkType: string;
  /** chunk ID，用于上下文窗口扩展 */
  chunkId: string;
}

// ——— 数据库单例 ———

let dbInstance: Database.Database | null = null;

function dbPath(): string {
  return path.join(process.cwd(), 'data', 'knowledge', 'knowledge.db');
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbFile = dbPath();
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbFile);
  sqliteVec.load(db);
  db.pragma('foreign_keys = ON');

  // 性能优化
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache

  initSchema(db);
  dbInstance = db;
  return db;
}

// ——— Schema 初始化 ———

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      content TEXT NOT NULL,
      section_path TEXT NOT NULL DEFAULT '',
      clause_number TEXT NOT NULL DEFAULT '',
      chunk_type TEXT NOT NULL DEFAULT 'general',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_clause ON chunks(clause_number);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
  `);

  // FTS5 全文搜索索引
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED,
      doc_id UNINDEXED,
      tokenize='unicode61'
    );
  `);

  // sqlite-vec 向量索引
  // 获取当前向量维度配置（默认 1024）
  const vecDim = 1024;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding float[${vecDim}] distance_metric=cosine
      );
    `);
  } catch (e) {
    // vec0 表已存在但维度不同时会报错，忽略
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('already exists')) {
      throw e;
    }
  }
}

// ——— 向量序列化 ———

/** 将 number[] 转为 Float32Array 的 Buffer（sqlite-vec 需要） */
function vecToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer);
}

// ——— 存储操作 ———

/**
 * 保存文档（含 chunks 和 embeddings）
 */
export function addDocument(
  _dataset: string,
  doc: DocumentRecord,
): void {
  const db = getDb();

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO documents (id, filename, title, type, imported_at, chunk_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertChunk = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, doc_id, content, section_path, clause_number, chunk_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO chunks_fts (content, chunk_id, doc_id) VALUES (?, ?, ?)
  `);

  const insertVec = db.prepare(`
    INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)
  `);

  const txn = db.transaction(() => {
    insertDoc.run(
      doc.id,
      doc.filename,
      doc.title,
      doc.type,
      doc.importedAt,
      doc.chunkCount,
    );

    for (let i = 0; i < doc.chunks.length; i++) {
      const chunk = doc.chunks[i];
      insertChunk.run(
        chunk.id,
        doc.id,
        chunk.content,
        chunk.sectionPath || '',
        chunk.clauseNumber || '',
        chunk.chunkType || 'general',
        i,
      );

      insertFts.run(chunk.content, chunk.id, doc.id);
      insertVec.run(chunk.id, vecToBuffer(chunk.embedding));
    }
  });

  txn();
}

/**
 * 列出数据集中所有文档的元信息
 */
export function listDocuments(
  _dataset: string,
): DocumentMeta[] {
  void _dataset;

  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, filename, title, type, imported_at as importedAt, chunk_count as chunkCount
    FROM documents
    ORDER BY imported_at DESC
  `);

  return stmt.all() as DocumentMeta[];
}

/**
 * 删除文档及其所有 chunks
 */
export function deleteDocument(
  _dataset: string,
  docId: string,
): boolean {
  const db = getDb();

  const txn = db.transaction(() => {
    // 获取该文档的所有 chunk ID
    const chunkIds = db.prepare(
      'SELECT id FROM chunks WHERE doc_id = ?',
    ).all(docId) as Array<{ id: string }>;

    // 删除 FTS 记录
    const delFts = db.prepare(
      'DELETE FROM chunks_fts WHERE chunk_id = ?',
    );
    for (const { id } of chunkIds) {
      delFts.run(id);
    }

    // 删除向量记录
    const delVec = db.prepare(
      'DELETE FROM vec_chunks WHERE chunk_id = ?',
    );
    for (const { id } of chunkIds) {
      delVec.run(id);
    }

    // 删除 chunks
    db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);

    // 删除文档
    const result = db.prepare('DELETE FROM documents WHERE id = ?').run(docId);

    return result.changes > 0;
  });

  return txn();
}

// ——— 搜索操作 ———

function buildDocTypeFilterClause(typeFilter?: string[]): {
  sql: string;
  params: string[];
} {
  if (!typeFilter || typeFilter.length === 0) {
    return { sql: '', params: [] };
  }

  const placeholders = typeFilter.map(() => '?').join(',');
  return {
    sql: `AND d.type IN (${placeholders})`,
    params: [...typeFilter],
  };
}

function resolveFetchLimit(topK: number, typeFilter?: string[]): number {
  return resolveSqlFetchLimit(topK, typeFilter);
}

function mapVectorRows(
  chunkRows: Array<{
    id: string;
    doc_id: string;
    content: string;
    section_path: string;
    clause_number: string;
    chunk_type: string;
  }>,
  distanceMap: Map<string, number>,
): SearchResult[] {
  return chunkRows.map((row) => {
    const distance = distanceMap.get(row.id) ?? 1;
    return {
      content: row.content,
      score: 1 - distance,
      docId: row.doc_id,
      sectionPath: row.section_path,
      clauseNumber: row.clause_number,
      chunkType: row.chunk_type,
      chunkId: row.id,
    };
  });
}

function loadVectorChunkRows(
  db: Database.Database,
  chunkIds: string[],
  typeFilter?: string[],
) {
  if (chunkIds.length === 0) return [];

  const typeFilterClause = buildDocTypeFilterClause(typeFilter);
  const placeholders = chunkIds.map(() => '?').join(',');

  return db.prepare(`
    SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type,
           d.type as doc_type
    FROM chunks c
    JOIN documents d ON c.doc_id = d.id
    WHERE c.id IN (${placeholders})
    ${typeFilterClause.sql}
  `).all(...chunkIds, ...typeFilterClause.params) as Array<{
    id: string;
    doc_id: string;
    content: string;
    section_path: string;
    clause_number: string;
    chunk_type: string;
  }>;
}

/**
 * 向量语义搜索 — 使用 sqlite-vec 近似最近邻
 */
export function searchByVector(
  _dataset: string,
  queryEmbedding: number[],
  topK: number = 10,
  typeFilter?: string[],
): SearchResult[] {
  const db = getDb();
  const queryBuf = vecToBuffer(queryEmbedding);
  const { maxSqlFetchLimit } = getRetrievalConfig();

  let fetchLimit = resolveFetchLimit(topK, typeFilter);

  while (true) {
    const vecResults = db.prepare(`
      SELECT chunk_id, distance
      FROM vec_chunks
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(queryBuf, fetchLimit) as Array<{ chunk_id: string; distance: number }>;

    if (vecResults.length === 0) return [];

    const chunkIds = vecResults.map((r) => r.chunk_id);
    const distanceMap = new Map(vecResults.map((r) => [r.chunk_id, r.distance]));
    const chunkRows = loadVectorChunkRows(db, chunkIds, typeFilter);
    const results = mapVectorRows(chunkRows, distanceMap)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const needsMore = typeFilter?.length && results.length < topK;
    const canGrow = fetchLimit < maxSqlFetchLimit && vecResults.length === fetchLimit;

    if (!needsMore || !canGrow) {
      return results;
    }

    fetchLimit = Math.min(fetchLimit * 2, maxSqlFetchLimit);
  }
}

/**
 * FTS5 全文关键词搜索
 */
export function searchByKeyword(
  _dataset: string,
  query: string,
  topK: number = 10,
  typeFilter?: string[],
): SearchResult[] {
  const db = getDb();

  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const { maxSqlFetchLimit } = getRetrievalConfig();
  const typeFilterClause = buildDocTypeFilterClause(typeFilter);
  let fetchLimit = resolveFetchLimit(topK, typeFilter);

  try {
    while (true) {
      const ftsResults = db.prepare(`
        SELECT chunk_id, doc_id, snippet(chunks_fts, 0, '', '', '...', 64) as snippet,
               bm25(chunks_fts) as rank
        FROM chunks_fts
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, fetchLimit) as Array<{
        chunk_id: string;
        doc_id: string;
        snippet: string;
        rank: number;
      }>;

      if (ftsResults.length === 0) return [];

      const chunkIds = ftsResults.map((r) => r.chunk_id);
      const rankMap = new Map(ftsResults.map((r) => [r.chunk_id, r.rank]));
      const placeholders = chunkIds.map(() => '?').join(',');
      const chunkRows = db.prepare(`
        SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type,
               d.type as doc_type
        FROM chunks c
        JOIN documents d ON c.doc_id = d.id
        WHERE c.id IN (${placeholders})
        ${typeFilterClause.sql}
      `).all(...chunkIds, ...typeFilterClause.params) as Array<{
        id: string;
        doc_id: string;
        content: string;
        section_path: string;
        clause_number: string;
        chunk_type: string;
        doc_type: string;
      }>;

      const results: SearchResult[] = [];
      for (const row of chunkRows) {
        const rawRank = rankMap.get(row.id) ?? 0;
        // FTS5 bm25() 返回负值，越相关越负；取负后映射到 [0,1)
        const score = rawRank < 0 ? 1 - 1 / (1 + Math.abs(rawRank)) : 0;

        results.push({
          content: row.content,
          score,
          docId: row.doc_id,
          sectionPath: row.section_path,
          clauseNumber: row.clause_number,
          chunkType: row.chunk_type,
          chunkId: row.id,
        });
      }

      const ranked = results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      const needsMore = typeFilter?.length && ranked.length < topK;
      const canGrow = fetchLimit < maxSqlFetchLimit && ftsResults.length === fetchLimit;

      if (!needsMore || !canGrow) {
        return ranked;
      }

      fetchLimit = Math.min(fetchLimit * 2, maxSqlFetchLimit);
    }
  } catch {
    return [];
  }
}

/**
 * 获取相邻 chunks（上下文窗口扩展）
 */
export function getAdjacentChunks(
  chunkId: string,
  windowSize: number = 1,
): SearchResult[] {
  const db = getDb();

  // 获取当前 chunk 的 doc_id 和 sort_order
  const current = db.prepare(`
    SELECT doc_id, sort_order FROM chunks WHERE id = ?
  `).get(chunkId) as { doc_id: string; sort_order: number } | undefined;

  if (!current) return [];

  const rows = db.prepare(`
    SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type
    FROM chunks c
    WHERE c.doc_id = ?
      AND c.sort_order BETWEEN ? AND ?
      AND c.id != ?
    ORDER BY c.sort_order
  `).all(
    current.doc_id,
    current.sort_order - windowSize,
    current.sort_order + windowSize,
    chunkId,
  ) as Array<{
    id: string;
    doc_id: string;
    content: string;
    section_path: string;
    clause_number: string;
    chunk_type: string;
  }>;

  return rows.map((row) => ({
    content: row.content,
    score: 0, // 上下文扩展的 chunk 不单独评分
    docId: row.doc_id,
    sectionPath: row.section_path,
    clauseNumber: row.clause_number,
    chunkType: row.chunk_type,
    chunkId: row.id,
  }));
}

/**
 * 条款号精确查询
 */
export function searchByClauseNumber(
  clauseNumber: string,
  typeFilter?: string[],
): SearchResult[] {
  const db = getDb();

  let rows;
  if (typeFilter && typeFilter.length > 0) {
    const placeholders = typeFilter.map(() => '?').join(',');
    rows = db.prepare(`
      SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type
      FROM chunks c
      JOIN documents d ON c.doc_id = d.id
      WHERE c.clause_number = ? AND d.type IN (${placeholders})
      ORDER BY c.sort_order
    `).all(clauseNumber, ...typeFilter);
  } else {
    rows = db.prepare(`
      SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type
      FROM chunks c
      WHERE c.clause_number = ?
      ORDER BY c.sort_order
    `).all(clauseNumber);
  }

  return (rows as Array<{
    id: string;
    doc_id: string;
    content: string;
    section_path: string;
    clause_number: string;
    chunk_type: string;
  }>).map((row) => ({
    content: row.content,
    score: 1, // 精确匹配满分
    docId: row.doc_id,
    sectionPath: row.section_path,
    clauseNumber: row.clause_number,
    chunkType: row.chunk_type,
    chunkId: row.id,
  }));
}

// ——— 章节提取（学习中心） ———

export interface DocumentSection {
  /** 条款编号，如 "6.2.3" */
  clauseNumber: string;
  /** 章节标题，如 "数据处理" */
  title: string;
  /** 所属文档 ID */
  docId: string;
  /** 所属文档类型 */
  docType: string;
  /** 该章节下的 chunk 数量 */
  chunkCount: number;
  /** 子条款编号列表，如 ["6.2.3.1", "6.2.3.4"] */
  childClauses: string[];
  /** 子条款标题列表（与 childClauses 对应） */
  childTitles: string[];
}

const TITLE_CLAUSE_PATTERN = /(?:[A-Z]\.\d+(?:\.\d+)+|\d+(?:\.\d+)+)/g;
const TITLE_BOUNDARY_PATTERNS = [
  /\s*漏\s*洞\s*描\s*述\s*[:：]?/i,
  /\s*漏\s*洞\s*风\s*险\s*[:：]?/i,
  /\s*修\s*复(?:\s*或\s*规\s*避)?\s*建\s*议\s*[:：]?/i,
  /\s*示\s*例\s*\d*\s*[:：]?/i,
  /\s*根\s*据\s*以\s*上/i,
  /\s*整\s*理\s*以\s*上/i,
  /\s*组\s*织\s*管\s*理\s*层/i,
  /\s*评\s*审\s*结\s*果\s*如\s*下/i,
  /\s*见\s*表\s*[A-Z]?\.\d+/i,
  /\s*本\s*项\s*目/i,
  /\s*本\s*案\s*例/i,
  /\s*该\s*软\s*件/i,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeClauseRef(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function normalizeOcrSpacing(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/\s*([:：,，。;；])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimTrailingNoise(value: string): string {
  return value
    .replace(/\s*\d+\s*[.…]+.*$/, '')
    .replace(/[“”"'`]+/g, '')
    .replace(/^[\s:：,，。;；\-—、)\]】]+/, '')
    .replace(/[\s:：,，。;；\-—、(\[【]+$/, '')
    .trim();
}

function findBoundaryIndex(text: string, clauseNumber: string): number {
  const indexes: number[] = [];

  for (const pattern of TITLE_BOUNDARY_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index > 0) {
      indexes.push(match.index);
    }
  }

  const currentClause = normalizeClauseRef(clauseNumber);
  for (const match of text.matchAll(TITLE_CLAUSE_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? -1;
    if (index <= 0) continue;
    if (normalizeClauseRef(raw) === currentClause) continue;
    indexes.push(index);
  }

  const sentenceBoundary = text.search(/[。！？]/);
  if (sentenceBoundary > 0) {
    indexes.push(sentenceBoundary);
  }

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function sanitizeTitleCandidate(rawTitle: string, clauseNumber: string): string {
  let title = normalizeOcrSpacing(rawTitle);
  const boundaryIndex = findBoundaryIndex(title, clauseNumber);
  if (boundaryIndex > 0) {
    title = title.slice(0, boundaryIndex);
  }

  title = trimTrailingNoise(normalizeOcrSpacing(title));
  return title;
}

export function isReadableKnowledgeTitle(title: string): boolean {
  const normalized = trimTrailingNoise(normalizeOcrSpacing(title));
  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 40) return false;
  if (/^(?:[A-Z]?\.\d+(?:\.\d+)*)$/i.test(normalized)) return false;
  if (TITLE_BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  const clausePattern = /(?:[A-Z]\.\d+(?:\.\d+)+|\d+(?:\.\d+)+)/;
  if (clausePattern.test(normalized)) {
    return false;
  }
  if (/[。！？]/.test(normalized)) return false;

  const punctuationCount = (normalized.match(/[,:：;；]/g) || []).length;
  if (punctuationCount > 1) return false;

  const readableChars = normalized.match(/[\u4e00-\u9fffA-Za-z0-9#+/]/g) || [];
  return readableChars.length / normalized.length >= 0.45;
}

export function extractClauseTitleCandidate(source: string, clauseNumber: string): string {
  if (!source) return '';

  const normalizedSource = normalizeOcrSpacing(source);
  if (!normalizedSource) return '';

  const bracketPrefix = new RegExp(`^\\[${escapeRegex(clauseNumber)}\\s+(.+?)\\]`);
  const bracketMatch = normalizedSource.match(bracketPrefix);
  if (bracketMatch) {
    const bracketTitle = sanitizeTitleCandidate(bracketMatch[1], clauseNumber);
    if (isReadableKnowledgeTitle(bracketTitle)) {
      return bracketTitle;
    }
  }

  let remainder = normalizedSource;
  if (remainder.startsWith(clauseNumber)) {
    remainder = remainder.slice(clauseNumber.length).trim();
  } else {
    return '';
  }

  const title = sanitizeTitleCandidate(remainder, clauseNumber);
  return isReadableKnowledgeTitle(title) ? title : '';
}

function extractTitleFromContent(content: string, clauseNumber: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 3)) {
    const title = extractClauseTitleCandidate(line, clauseNumber);
    if (title) {
      return title;
    }
  }

  return '';
}

/**
 * 从 section_path 中提取指定条款编号对应的标题。
 *
 * section_path 示例:
 *   "6 源代码漏洞测试内容 > 6.2 源代码漏洞说明 > 6.2.3 数据处理 > 6.2.3.4 SQL 注入漏洞描述:..."
 *
 * extractTitleFromPath(path, "6.2.3") → "数据处理"
 */
function extractTitleFromPath(sectionPath: string, clauseNumber: string): string {
  const segments = sectionPath.split(' > ');
  for (const seg of segments) {
    const title = extractClauseTitleCandidate(seg.trim(), clauseNumber);
    if (title) {
      return title;
    }
  }
  return '';
}

/**
 * 检测 section_path 是否存在严重乱码（CJK 编码问题）
 */
function isSectionPathGarbled(sectionPath: string): boolean {
  if (!sectionPath) return true;
  // 统计常见乱码特征字符占比
  const garbleChars = sectionPath.match(/[ø÷ùúûüýþÿòóôõöðñêëìíîïäåæçèéàáâãÀÁÂÃÄÅÆÇÈÉÊ]/g);
  if (!garbleChars) return false;
  return garbleChars.length / sectionPath.length > 0.05;
}

/**
 * 提取文档的章节结构（用于学习中心动态生成章节）
 *
 * 策略：
 * 1. 查询所有 chunk 的 clause_number 和 section_path
 * 2. 按条款编号层级分组（例如 6.2.x 为漏洞大类）
 * 3. 提取各层级的标题
 * 4. 只返回有实质内容的章节（包含子条款的大类）
 */
export function getDocumentSections(
  _dataset: string,
  docType?: string,
): DocumentSection[] {
  const db = getDb();

  // 查询所有 chunk 的条款编号和 section_path
  let rows: Array<{
    clause_number: string;
    section_path: string;
    content: string;
    doc_id: string;
    doc_type: string;
  }>;

  if (docType) {
    rows = db.prepare(`
      SELECT c.clause_number, c.section_path, c.content, c.doc_id, d.type as doc_type
      FROM chunks c
      JOIN documents d ON c.doc_id = d.id
      WHERE d.type = ? AND c.clause_number != ''
      ORDER BY c.sort_order
    `).all(docType) as typeof rows;
  } else {
    rows = db.prepare(`
      SELECT c.clause_number, c.section_path, c.content, c.doc_id, d.type as doc_type
      FROM chunks c
      JOIN documents d ON c.doc_id = d.id
      WHERE c.clause_number != ''
      ORDER BY c.sort_order
    `).all() as typeof rows;
  }

  if (rows.length === 0) return [];

  // 检测乱码：用前 20 条 section_path 抽样
  const samples = rows.slice(0, 20).filter((r) => r.section_path.length > 10);
  const garbledCount = samples.filter((r) => isSectionPathGarbled(r.section_path)).length;
  if (samples.length > 0 && garbledCount / samples.length > 0.5) {
    // 文档乱码严重，无法提取可靠章节
    return [];
  }

  // 按 docId 分组，提取每个文档的章节结构
  const docGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = docGroups.get(row.doc_id) || [];
    group.push(row);
    docGroups.set(row.doc_id, group);
  }

  const allSections: DocumentSection[] = [];

  for (const [docId, docRows] of docGroups) {
    const docTypeVal = docRows[0].doc_type;

    // 收集所有唯一条款编号
    const clauseNumbers = new Set<string>();
    for (const row of docRows) {
      clauseNumbers.add(row.clause_number);
    }

    // 找出"漏洞说明"大类章节：匹配 X.Y.Z 格式（3 级），且有 X.Y.Z.N 子条款
    // 这些是标准中的漏洞分类章节，最适合作为学习章节
    const level3Clauses = new Map<string, {
      children: Set<string>;
      chunkCount: number;
    }>();

    for (const cn of clauseNumbers) {
      const parts = cn.split('.');
      if (parts.length === 3) {
        // 这是一个 X.Y.Z 级条款
        if (!level3Clauses.has(cn)) {
          level3Clauses.set(cn, { children: new Set(), chunkCount: 0 });
        }
      } else if (parts.length === 4) {
        // 这是一个 X.Y.Z.N 子条款，归到父级
        const parent = parts.slice(0, 3).join('.');
        if (!level3Clauses.has(parent)) {
          level3Clauses.set(parent, { children: new Set(), chunkCount: 0 });
        }
        level3Clauses.get(parent)!.children.add(cn);
      }
    }

    // 统计每个大类的 chunk 数量，并取样 section_path
    for (const row of docRows) {
      const parts = row.clause_number.split('.');
      if (parts.length >= 3) {
        const parent = parts.slice(0, 3).join('.');
        const entry = level3Clauses.get(parent);
        if (entry) {
          entry.chunkCount++;
        }
      }
    }

    // 转换为 DocumentSection，提取标题
    for (const [clauseNum, info] of level3Clauses) {
      // 只保留有子条款的章节（真正的漏洞分类）
      if (info.children.size === 0 && info.chunkCount < 2) continue;

      const ownRows = docRows.filter((row) => row.clause_number === clauseNum);
      const childRows = docRows.filter((row) => row.clause_number.startsWith(`${clauseNum}.`));
      let title = '';

      for (const row of ownRows) {
        title = extractTitleFromContent(row.content, clauseNum);
        if (title) break;
      }

      if (!title) {
        for (const row of ownRows) {
          title = extractTitleFromPath(row.section_path, clauseNum);
          if (title) break;
        }
      }

      if (!title) {
        for (const row of childRows) {
          title = extractTitleFromPath(row.section_path, clauseNum);
          if (title) break;
        }
      }

      if (!title) continue; // 无法提取标题，跳过

      // 提取子条款标题
      const childClauses = Array.from(info.children).sort((a, b) => {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          if ((aParts[i] || 0) !== (bParts[i] || 0)) return (aParts[i] || 0) - (bParts[i] || 0);
        }
        return 0;
      });

      const childTitles: string[] = [];
      for (const childCn of childClauses) {
        let childTitle = '';
        const childRowsForClause = docRows.filter((row) => row.clause_number === childCn);
        for (const row of childRowsForClause) {
          childTitle = extractTitleFromContent(row.content, childCn);
          if (childTitle) break;
        }
        if (!childTitle) {
          for (const row of childRowsForClause) {
            childTitle = extractTitleFromPath(row.section_path, childCn);
            if (childTitle) break;
          }
        }
        childTitles.push(childTitle);
      }

      allSections.push({
        clauseNumber: clauseNum,
        title,
        docId,
        docType: docTypeVal,
        chunkCount: info.chunkCount,
        childClauses,
        childTitles,
      });
    }
  }

  // 按条款编号排序
  return allSections.sort((a, b) => {
    const aParts = a.clauseNumber.split('.').map(Number);
    const bParts = b.clauseNumber.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      if ((aParts[i] || 0) !== (bParts[i] || 0)) return (aParts[i] || 0) - (bParts[i] || 0);
    }
    return 0;
  });
}

/**
 * 按条款编号前缀获取所有 chunks（用于章节内容生成）
 *
 * 例如 getChunksByClausePrefix("vulnerability_audit_standards", "6.2.3", "java")
 * 返回 6.2.3、6.2.3.1、6.2.3.2 … 的所有 chunks
 */
export function getChunksByClausePrefix(
  _dataset: string,
  clausePrefix: string,
  docType?: string | string[],
): SearchResult[] {
  const db = getDb();
  const likePattern = clausePrefix + '%';
  const typeFilter = Array.isArray(docType)
    ? docType
    : docType
      ? [docType]
      : [];

  let chunkRows: Array<{
    id: string;
    doc_id: string;
    content: string;
    section_path: string;
    clause_number: string;
    chunk_type: string;
  }>;

  if (typeFilter.length > 0) {
    const placeholders = typeFilter.map(() => '?').join(',');
    chunkRows = db.prepare(`
      SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type
      FROM chunks c
      JOIN documents d ON c.doc_id = d.id
      WHERE c.clause_number LIKE ? AND d.type IN (${placeholders})
      ORDER BY c.sort_order
    `).all(likePattern, ...typeFilter) as typeof chunkRows;
  } else {
    chunkRows = db.prepare(`
      SELECT c.id, c.doc_id, c.content, c.section_path, c.clause_number, c.chunk_type
      FROM chunks c
      WHERE c.clause_number LIKE ?
      ORDER BY c.sort_order
    `).all(likePattern) as typeof chunkRows;
  }

  return chunkRows.map((row) => ({
    content: row.content,
    score: 1,
    docId: row.doc_id,
    sectionPath: row.section_path,
    clauseNumber: row.clause_number,
    chunkType: row.chunk_type,
    chunkId: row.id,
  }));
}

/**
 * 关闭数据库连接（用于热重载）
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
