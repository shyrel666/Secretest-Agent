/**
 * 题库 SQLite 存储
 *
 * 复用与知识库相同的数据库文件（data/knowledge/knowledge.db），新增四张表：
 * - question_records   题目快照（按 questionText+code 哈希去重）
 * - answer_records     答题记录（追加，保留多次答题轨迹）
 * - ai_explanations    AI 讲解缓存（按需生成，永久保存）
 * - mastery_status     掌握状态（unreviewed / needs_review / mastered）
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ——— 公共类型 ———

export type MasteryStatus = 'unreviewed' | 'needs_review' | 'mastered';

export interface QuestionRecord {
  id: string;
  questionText: string;
  code: string;
  language: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  vulnerabilityType: string;
  standardReference: string;
  createdAt: string;
}

export interface QuestionWithStats extends QuestionRecord {
  /** 最近一次答题的选择 */
  lastUserAnswer: number | null;
  lastIsCorrect: boolean | null;
  answerCount: number;
  masteryStatus: MasteryStatus;
  hasAiExplanation: boolean;
}

export interface AiExplanationRecord {
  questionId: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  cachedAt: string;
}

export interface QuestionDetail extends QuestionWithStats {
  aiExplanation: AiExplanationRecord | null;
}

export interface QuestionBankStats {
  total: number;
  correctCount: number;
  wrongCount: number;
  aiExplanationCount: number;
  masteredCount: number;
  needsReviewCount: number;
}

export interface QuestionFilters {
  language?: string;
  vulnerabilityType?: string;
  difficulty?: string;
  /** 按最近一次答题是否正确筛选 */
  isCorrect?: boolean;
  masteryStatus?: MasteryStatus | 'all';
}

// 用于接收来自测评 store 的数据（不直接 import，避免引入 'use client' 依赖）
interface AssessmentQuestionInput {
  id: string;
  code: string;
  language: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  vulnerabilityType: string;
  standardReference: string;
}

interface AssessmentAnswerInput {
  question: AssessmentQuestionInput;
  userAnswer: number;
  isCorrect: boolean;
}

const LEGACY_USER_ID = '__legacy_anonymous__';

// ——— 数据库单例 ———

let dbInstance: Database.Database | null = null;

function dbPath(): string {
  return path.join(process.cwd(), 'data', 'knowledge', 'knowledge.db');
}

/** 不加载 sqlite-vec，题库只需标准 SQL */
function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbFile = dbPath();
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbFile);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  initSchema(db);
  dbInstance = db;
  return db;
}

// ——— Schema ———

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_records (
      id                 TEXT PRIMARY KEY,
      question_text      TEXT NOT NULL,
      code               TEXT NOT NULL DEFAULT '',
      language           TEXT NOT NULL,
      options            TEXT NOT NULL,
      correct_answer     INTEGER NOT NULL,
      explanation        TEXT NOT NULL DEFAULT '',
      difficulty         TEXT NOT NULL DEFAULT 'medium',
      vulnerability_type TEXT NOT NULL DEFAULT '',
      standard_reference TEXT NOT NULL DEFAULT '',
      created_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_qr_language ON question_records(language);
    CREATE INDEX IF NOT EXISTS idx_qr_vuln     ON question_records(vulnerability_type);
    CREATE INDEX IF NOT EXISTS idx_qr_diff     ON question_records(difficulty);
  `);

  ensureAnswerRecordsSchema(db);
  ensureAiExplanationsSchema(db);
  ensureMasteryStatusSchema(db);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;

  return Boolean(row?.name);
}

function getTableColumns(db: Database.Database, tableName: string): Array<{
  name: string;
  pk: number;
}> {
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
    pk: number;
  }>;
}

function ensureAnswerRecordsSchema(db: Database.Database): void {
  if (!tableExists(db, 'answer_records')) {
    db.exec(`
      CREATE TABLE answer_records (
        id          TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        user_answer INTEGER NOT NULL,
        selected_option_text TEXT,
        is_correct  INTEGER NOT NULL,
        answered_at TEXT NOT NULL,
        session_id  TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES question_records(id) ON DELETE CASCADE
      );
    `);
  }

  const columns = getTableColumns(db, 'answer_records');
  const hasUserId = columns.some((column) => column.name === 'user_id');
  const hasSelectedOptionText = columns.some((column) => column.name === 'selected_option_text');

  if (!hasUserId) {
    db.exec(`
      ALTER TABLE answer_records
      ADD COLUMN user_id TEXT NOT NULL DEFAULT '${LEGACY_USER_ID}';
    `);
  }

  if (!hasSelectedOptionText) {
    db.exec(`
      ALTER TABLE answer_records
      ADD COLUMN selected_option_text TEXT;
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ar_question ON answer_records(question_id);
    CREATE INDEX IF NOT EXISTS idx_ar_session ON answer_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_ar_user_question_answered_at
      ON answer_records(user_id, question_id, answered_at);
  `);
}

function ensureAiExplanationsSchema(db: Database.Database): void {
  const tableName = 'ai_explanations';

  if (!tableExists(db, tableName)) {
    db.exec(`
      CREATE TABLE ai_explanations (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        question_id       TEXT NOT NULL,
        content           TEXT NOT NULL,
        prompt_tokens     INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        cached_at         TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES question_records(id) ON DELETE CASCADE,
        UNIQUE (user_id, question_id)
      );
    `);
  } else {
    const columns = getTableColumns(db, tableName);
    const hasUserId = columns.some((column) => column.name === 'user_id');

    if (!hasUserId) {
      db.exec(`
        ALTER TABLE ai_explanations RENAME TO ai_explanations_legacy;

        CREATE TABLE ai_explanations (
          id                TEXT PRIMARY KEY,
          user_id           TEXT NOT NULL,
          question_id       TEXT NOT NULL,
          content           TEXT NOT NULL,
          prompt_tokens     INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          cached_at         TEXT NOT NULL,
          FOREIGN KEY (question_id) REFERENCES question_records(id) ON DELETE CASCADE,
          UNIQUE (user_id, question_id)
        );

        INSERT INTO ai_explanations (id, user_id, question_id, content, prompt_tokens, completion_tokens, cached_at)
        SELECT id, '${LEGACY_USER_ID}', question_id, content, prompt_tokens, completion_tokens, cached_at
        FROM ai_explanations_legacy;

        DROP TABLE ai_explanations_legacy;
      `);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ae_user_question
      ON ai_explanations(user_id, question_id);
  `);
}

function ensureMasteryStatusSchema(db: Database.Database): void {
  const tableName = 'mastery_status';

  if (!tableExists(db, tableName)) {
    db.exec(`
      CREATE TABLE mastery_status (
        user_id     TEXT NOT NULL,
        question_id TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'unreviewed',
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id),
        FOREIGN KEY (question_id) REFERENCES question_records(id) ON DELETE CASCADE
      );
    `);
  } else {
    const columns = getTableColumns(db, tableName);
    const hasUserId = columns.some((column) => column.name === 'user_id');
    const pkColumns = columns.filter((column) => column.pk > 0);
    const hasCompositePrimaryKey =
      pkColumns.length === 2
      && pkColumns.some((column) => column.name === 'user_id')
      && pkColumns.some((column) => column.name === 'question_id');

    if (!hasUserId || !hasCompositePrimaryKey) {
      db.exec(`
        ALTER TABLE mastery_status RENAME TO mastery_status_legacy;

        CREATE TABLE mastery_status (
          user_id     TEXT NOT NULL,
          question_id TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'unreviewed',
          updated_at  TEXT NOT NULL,
          PRIMARY KEY (user_id, question_id),
          FOREIGN KEY (question_id) REFERENCES question_records(id) ON DELETE CASCADE
        );

        INSERT INTO mastery_status (user_id, question_id, status, updated_at)
        SELECT '${LEGACY_USER_ID}', question_id, status, updated_at
        FROM mastery_status_legacy;

        DROP TABLE mastery_status_legacy;
      `);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ms_user_status
      ON mastery_status(user_id, status);
  `);
}

// ——— 工具函数 ———

function generateQuestionId(questionText: string, code: string): string {
  return crypto
    .createHash('sha256')
    .update(`${questionText}|${code}`)
    .digest('hex')
    .slice(0, 32);
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveSelectedOptionText(options: string[], userAnswer: number): string | null {
  if (!Array.isArray(options) || userAnswer < 0 || userAnswer >= options.length) {
    return null;
  }

  return options[userAnswer] ?? null;
}

function resolveLastUserAnswerIndex(
  options: string[],
  storedIndex: unknown,
  selectedOptionText: unknown,
): number | null {
  if (typeof selectedOptionText === 'string') {
    const resolvedIndex = options.findIndex((option) => option === selectedOptionText);
    if (resolvedIndex >= 0) {
      return resolvedIndex;
    }
  }

  return typeof storedIndex === 'number' ? storedIndex : null;
}

function mapRow(row: Record<string, unknown>): QuestionWithStats {
  const options = JSON.parse(row.options as string) as string[];

  return {
    id: row.id as string,
    questionText: row.question_text as string,
    code: row.code as string,
    language: row.language as string,
    options,
    correctAnswer: row.correct_answer as number,
    explanation: row.explanation as string,
    difficulty: row.difficulty as string,
    vulnerabilityType: row.vulnerability_type as string,
    standardReference: row.standard_reference as string,
    createdAt: row.created_at as string,
    lastUserAnswer: resolveLastUserAnswerIndex(
      options,
      row.last_user_answer,
      row.last_selected_option_text,
    ),
    lastIsCorrect:
      row.last_is_correct !== null && row.last_is_correct !== undefined
        ? Boolean(row.last_is_correct)
        : null,
    answerCount: (row.answer_count as number) ?? 0,
    masteryStatus: ((row.mastery_status as string) ?? 'unreviewed') as MasteryStatus,
    hasAiExplanation: Boolean(row.has_ai_explanation),
  };
}

function getUserActivityScore(db: Database.Database, userId: string): number {
  const row = db.prepare(`
    SELECT
      (
        (SELECT COUNT(*) FROM answer_records WHERE user_id = @userId) +
        (SELECT COUNT(*) FROM mastery_status WHERE user_id = @userId) +
        (SELECT COUNT(*) FROM ai_explanations WHERE user_id = @userId)
      ) AS activity_score
  `).get({ userId }) as { activity_score: number } | undefined;

  return row?.activity_score ?? 0;
}

function getMostActiveQuestionBankUserId(db: Database.Database): string | null {
  const row = db.prepare(`
    SELECT user_id
    FROM (
      SELECT user_id, COUNT(*) * 10 AS activity_score, MAX(answered_at) AS last_activity
      FROM answer_records
      WHERE user_id != ''
      GROUP BY user_id

      UNION ALL

      SELECT user_id, COUNT(*) AS activity_score, MAX(updated_at) AS last_activity
      FROM mastery_status
      WHERE user_id != ''
      GROUP BY user_id

      UNION ALL

      SELECT user_id, COUNT(*) AS activity_score, MAX(cached_at) AS last_activity
      FROM ai_explanations
      WHERE user_id != ''
      GROUP BY user_id
    ) user_activity
    GROUP BY user_id
    ORDER BY SUM(activity_score) DESC, MAX(last_activity) DESC, user_id ASC
    LIMIT 1
  `).get() as { user_id: string } | undefined;

  return row?.user_id ?? null;
}

function isQuestionBankSingleUserContinuityEnabled(): boolean {
  const mode = process.env.QUESTION_BANK_SINGLE_USER_MODE?.trim().toLowerCase();

  if (mode === 'true' || mode === '1' || mode === 'yes' || mode === 'on') {
    return true;
  }

  if (mode === 'false' || mode === '0' || mode === 'no' || mode === 'off') {
    return false;
  }

  const hostname = (process.env.HOSTNAME || 'localhost').trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** 获取每道题最近一次答题的子查询 SQL */
const LAST_ANSWER_SUBQUERY = `
  SELECT question_id, user_answer, is_correct, selected_option_text
  FROM (
    SELECT
      question_id,
      user_answer,
      is_correct,
      selected_option_text,
      ROW_NUMBER() OVER (
        PARTITION BY question_id
        ORDER BY answered_at DESC, id DESC
      ) AS row_num
    FROM answer_records
    WHERE user_id = @userId
  ) latest_answers
  WHERE row_num = 1
`;

const BASE_SELECT = `
  SELECT
    q.id, q.question_text, q.code, q.language, q.options, q.correct_answer,
    q.explanation, q.difficulty, q.vulnerability_type, q.standard_reference, q.created_at,
    la.user_answer AS last_user_answer,
    la.selected_option_text AS last_selected_option_text,
    la.is_correct  AS last_is_correct,
    COUNT(ar.id)   AS answer_count,
    COALESCE(ms.status, 'unreviewed') AS mastery_status,
    CASE WHEN ae.question_id IS NOT NULL THEN 1 ELSE 0 END AS has_ai_explanation
  FROM question_records q
  LEFT JOIN answer_records ar ON ar.question_id = q.id AND ar.user_id = @userId
  LEFT JOIN (${LAST_ANSWER_SUBQUERY}) la ON la.question_id = q.id
  LEFT JOIN ai_explanations ae ON ae.question_id = q.id AND ae.user_id = @userId
  LEFT JOIN mastery_status ms ON ms.question_id = q.id AND ms.user_id = @userId
`;

// ——— 公共导出函数 ———

/**
 * 本地匿名用户连续性：
 * 如果当前请求带来的匿名 userId 没有任何题库行为，沿用数据库中已有的活跃用户。
 * 这能避免换终端/换访问入口导致 cookie 缺失后，题库覆盖率和错题统计看起来被清零。
 */
export function resolveQuestionBankUserId(userId: string): string {
  const db = getDb();
  const normalizedUserId = userId.trim();

  if (!isQuestionBankSingleUserContinuityEnabled()) {
    return normalizedUserId || userId;
  }

  if (!normalizedUserId) {
    return getMostActiveQuestionBankUserId(db) ?? userId;
  }

  if (getUserActivityScore(db, normalizedUserId) > 0) {
    return normalizedUserId;
  }

  return getMostActiveQuestionBankUserId(db) ?? normalizedUserId;
}

/**
 * 保存一次测评的全部答题记录（题目+答案）
 * 同一道题（按 questionText+code 哈希）重复时只更新答题记录，不重复插入题目
 */
export function saveAssessmentResults(
  answers: AssessmentAnswerInput[],
  sessionId: string,
  userId: string,
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const insertQuestion = db.prepare(`
    INSERT OR IGNORE INTO question_records
      (id, question_text, code, language, options, correct_answer, explanation, difficulty, vulnerability_type, standard_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAnswer = db.prepare(`
    INSERT INTO answer_records (
      id,
      question_id,
      user_id,
      user_answer,
      selected_option_text,
      is_correct,
      answered_at,
      session_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initMastery = db.prepare(`
    INSERT OR IGNORE INTO mastery_status (user_id, question_id, status, updated_at)
    VALUES (?, ?, 'unreviewed', ?)
  `);

  const txn = db.transaction(() => {
    for (let i = 0; i < answers.length; i++) {
      const { question: q, userAnswer, isCorrect } = answers[i];
      const questionId = generateQuestionId(q.question, q.code);

      insertQuestion.run(
        questionId,
        q.question,
        q.code,
        q.language,
        JSON.stringify(q.options),
        q.correctAnswer,
        q.explanation,
        q.difficulty,
        q.vulnerabilityType,
        q.standardReference,
        now,
      );

      initMastery.run(userId, questionId, now);

      insertAnswer.run(
        randomId('ans') + `_${i}`,
        questionId,
        userId,
        userAnswer,
        resolveSelectedOptionText(q.options, userAnswer),
        isCorrect ? 1 : 0,
        now,
        sessionId,
      );
    }
  });

  txn();
}

/** 查询所有题目，支持多条件筛选 */
export function getAllQuestions(userId: string, filters?: QuestionFilters): QuestionWithStats[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = { userId };

  if (filters?.language && filters.language !== 'all') {
    conditions.push('q.language = @language');
    params.language = filters.language;
  }
  if (filters?.vulnerabilityType && filters.vulnerabilityType !== 'all') {
    conditions.push('q.vulnerability_type = @vulnerabilityType');
    params.vulnerabilityType = filters.vulnerabilityType;
  }
  if (filters?.difficulty && filters.difficulty !== 'all') {
    conditions.push('q.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters?.masteryStatus && filters.masteryStatus !== 'all') {
    conditions.push("COALESCE(ms.status, 'unreviewed') = @masteryStatus");
    params.masteryStatus = filters.masteryStatus;
  }
  if (filters?.isCorrect !== undefined) {
    conditions.push('la.is_correct = @isCorrect');
    params.isCorrect = filters.isCorrect ? 1 : 0;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`${BASE_SELECT} ${where} GROUP BY q.id ORDER BY q.created_at DESC`)
    .all(params) as Record<string, unknown>[];

  return rows.map(mapRow);
}

/** 随机抽取 N 道题，支持筛选 */
export function getRandomQuestions(
  count: number,
  userId: string,
  filters?: QuestionFilters,
): QuestionWithStats[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {
    userId,
    count,
  };

  if (filters?.language && filters.language !== 'all') {
    conditions.push('q.language = @language');
    params.language = filters.language;
  }
  if (filters?.vulnerabilityType && filters.vulnerabilityType !== 'all') {
    conditions.push('q.vulnerability_type = @vulnerabilityType');
    params.vulnerabilityType = filters.vulnerabilityType;
  }
  if (filters?.difficulty && filters.difficulty !== 'all') {
    conditions.push('q.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters?.masteryStatus && filters.masteryStatus !== 'all') {
    conditions.push("COALESCE(ms.status, 'unreviewed') = @masteryStatus");
    params.masteryStatus = filters.masteryStatus;
  }
  if (filters?.isCorrect !== undefined) {
    conditions.push('la.is_correct = @isCorrect');
    params.isCorrect = filters.isCorrect ? 1 : 0;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`${BASE_SELECT} ${where} GROUP BY q.id ORDER BY RANDOM() LIMIT @count`)
    .all(params) as Record<string, unknown>[];

  return rows.map(mapRow);
}

/** 获取单题详情（含 AI 讲解缓存） */
export function getQuestionDetail(questionId: string, userId: string): QuestionDetail | null {
  const db = getDb();

  const row = db
    .prepare(`${BASE_SELECT} WHERE q.id = @questionId GROUP BY q.id`)
    .get({ userId, questionId }) as Record<string, unknown> | undefined;

  if (!row) return null;

  const base = mapRow(row);

  const aiRow = db
    .prepare(
      'SELECT question_id, content, prompt_tokens, completion_tokens, cached_at FROM ai_explanations WHERE question_id = @questionId AND user_id = @userId',
    )
    .get({ questionId, userId }) as Record<string, unknown> | undefined;

  return {
    ...base,
    aiExplanation: aiRow
      ? {
          questionId: aiRow.question_id as string,
          content: aiRow.content as string,
          promptTokens: aiRow.prompt_tokens as number,
          completionTokens: aiRow.completion_tokens as number,
          cachedAt: aiRow.cached_at as string,
        }
      : null,
  };
}

/** 缓存 AI 讲解结果 */
export function saveAiExplanation(
  questionId: string,
  content: string,
  promptTokens: number,
  completionTokens: number,
  userId: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO ai_explanations (id, user_id, question_id, content, prompt_tokens, completion_tokens, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `ae_${userId}_${questionId}`,
    userId,
    questionId,
    content,
    promptTokens,
    completionTokens,
    new Date().toISOString(),
  );
}

/** 获取题库统计信息 */
export function getQuestionBankStats(userId: string): QuestionBankStats {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) AS n FROM question_records').get() as { n: number }).n;
  const aiExplanationCount = (
    db.prepare('SELECT COUNT(*) AS n FROM ai_explanations WHERE user_id = ?').get(userId) as { n: number }
  ).n;
  const masteredCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM mastery_status WHERE user_id = ? AND status = 'mastered'")
      .get(userId) as { n: number }
  ).n;
  const needsReviewCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM mastery_status WHERE user_id = ? AND status = 'needs_review'")
      .get(userId) as { n: number }
  ).n;

  const answerStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN la.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
         SUM(CASE WHEN la.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
       FROM question_records q
       LEFT JOIN (${LAST_ANSWER_SUBQUERY}) la ON la.question_id = q.id
       WHERE la.question_id IS NOT NULL`,
    )
    .get({ userId }) as { correct_count: number | null; wrong_count: number | null };

  return {
    total,
    correctCount: answerStats?.correct_count ?? 0,
    wrongCount: answerStats?.wrong_count ?? 0,
    aiExplanationCount,
    masteredCount,
    needsReviewCount,
  };
}

/** 设置题目的掌握状态 */
export function setMasteryStatus(questionId: string, status: MasteryStatus, userId: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO mastery_status (user_id, question_id, status, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, questionId, status, new Date().toISOString());
}

/** 保存练习模式中单条答题记录 */
export function saveAnswerRecord(
  questionId: string,
  userAnswer: number,
  selectedOptionText: string | null,
  isCorrect: boolean,
  sessionId: string,
  userId: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO answer_records (
      id,
      question_id,
      user_id,
      user_answer,
      selected_option_text,
      is_correct,
      answered_at,
      session_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomId('ans'),
    questionId,
    userId,
    userAnswer,
    selectedOptionText,
    isCorrect ? 1 : 0,
    new Date().toISOString(),
    sessionId,
  );
}

/** 删除当前用户与题目的关联数据；若题目不再被任何用户引用，则清理题目主记录 */
export function deleteQuestionForUser(questionId: string, userId: string): boolean {
  const db = getDb();
  const txn = db.transaction(() => {
    const existingQuestion = db.prepare('SELECT 1 FROM question_records WHERE id = ?').get(questionId);
    if (!existingQuestion) {
      return false;
    }

    db.prepare('DELETE FROM answer_records WHERE question_id = ? AND user_id = ?').run(questionId, userId);
    db.prepare('DELETE FROM ai_explanations WHERE question_id = ? AND user_id = ?').run(questionId, userId);
    db.prepare('DELETE FROM mastery_status WHERE question_id = ? AND user_id = ?').run(questionId, userId);

    const remaining = db.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM answer_records WHERE question_id = ?
        UNION ALL
        SELECT 1 FROM ai_explanations WHERE question_id = ?
        UNION ALL
        SELECT 1 FROM mastery_status WHERE question_id = ?
      ) AS has_related_data
    `).get(questionId, questionId, questionId) as { has_related_data: number };

    if (!remaining.has_related_data) {
      db.prepare('DELETE FROM question_records WHERE id = ?').run(questionId);
    }

    const removedUserData = db.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM answer_records WHERE question_id = ? AND user_id = ?
        UNION ALL
        SELECT 1 FROM ai_explanations WHERE question_id = ? AND user_id = ?
        UNION ALL
        SELECT 1 FROM mastery_status WHERE question_id = ? AND user_id = ?
      ) AS has_user_data
    `).get(questionId, userId, questionId, userId, questionId, userId) as { has_user_data: number };

    return !removedUserData.has_user_data;
  });

  return txn();
}

/** 返回题库中已有的语言列表 */
export function getDistinctLanguages(): string[] {
  const db = getDb();
  return (
    db
      .prepare('SELECT DISTINCT language FROM question_records ORDER BY language')
      .all() as { language: string }[]
  ).map((r) => r.language);
}

/** 返回题库中已有的漏洞类型列表 */
export function getDistinctVulnerabilityTypes(language?: string): string[] {
  const db = getDb();
  if (language) {
    return (
      db
        .prepare(
          'SELECT DISTINCT vulnerability_type FROM question_records WHERE language = ? ORDER BY vulnerability_type',
        )
        .all(language) as { vulnerability_type: string }[]
    ).map((r) => r.vulnerability_type);
  }
  return (
    db
      .prepare(
        'SELECT DISTINCT vulnerability_type FROM question_records ORDER BY vulnerability_type',
      )
      .all() as { vulnerability_type: string }[]
  ).map((r) => r.vulnerability_type);
}

/** 返回指定用户已答题命中的漏洞类型集合（可按语言过滤） */
export function getCoveredVulnerabilityTypes(userId: string, language?: string): string[] {
  const db = getDb();
  if (language) {
    return (
      db
        .prepare(`
          SELECT DISTINCT q.vulnerability_type
          FROM answer_records a
          JOIN question_records q ON a.question_id = q.id
          WHERE a.user_id = ? AND q.language = ?
          ORDER BY q.vulnerability_type
        `)
        .all(userId, language) as { vulnerability_type: string }[]
    ).map((r) => r.vulnerability_type);
  }
  return (
    db
      .prepare(`
        SELECT DISTINCT q.vulnerability_type
        FROM answer_records a
        JOIN question_records q ON a.question_id = q.id
        WHERE a.user_id = ?
        ORDER BY q.vulnerability_type
      `)
      .all(userId) as { vulnerability_type: string }[]
  ).map((r) => r.vulnerability_type);
}
