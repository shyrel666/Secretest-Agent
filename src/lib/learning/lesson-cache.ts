import type { RetrievalTraceItem, ToolCitation } from '@/lib/knowledge/mcp-tools';
import type { TokenUsage } from '@/lib/token-usage';
import {
  LESSON_DOCUMENT_FORMAT_VERSION,
  cloneLessonDocument,
  type LessonDocument,
} from '@/lib/learning/lesson-document';

const LESSON_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CachedLessonPayload {
  lessonDocument: LessonDocument;
  references: string[];
  usage?: TokenUsage;
  citations?: ToolCitation[];
  grounding?: {
    grounded: boolean;
    issues: string[];
  };
  retrievalTrace?: RetrievalTraceItem[];
}

interface CachedLessonEntry extends CachedLessonPayload {
  cachedAt: number;
}

const lessonCache = new Map<string, CachedLessonEntry>();
const pendingLessonCache = new Map<string, Promise<CachedLessonPayload>>();

function isExpired(entry: CachedLessonEntry): boolean {
  return Date.now() - entry.cachedAt > LESSON_CACHE_TTL_MS;
}

function cloneLessonPayload(entry: CachedLessonEntry | CachedLessonPayload): CachedLessonPayload {
  return {
    lessonDocument: cloneLessonDocument(entry.lessonDocument),
    references: [...entry.references],
    usage: entry.usage ? { ...entry.usage } : undefined,
    citations: entry.citations?.map((citation) => ({ ...citation })),
    grounding: entry.grounding
      ? {
          grounded: entry.grounding.grounded,
          issues: [...entry.grounding.issues],
        }
      : undefined,
    retrievalTrace: entry.retrievalTrace?.map((item) => ({
      ...item,
      citations: item.citations.map((citation) => ({ ...citation })),
    })),
  };
}

export function buildLessonCacheKey(params: {
  userId?: string;
  topicId: string;
  clausePrefix?: string;
  docId?: string;
  model: string;
  temperature: number;
  thinking: boolean;
  modelBaseUrl?: string;
}): string {
  return JSON.stringify({
    userId: params.userId || '',
    formatVersion: LESSON_DOCUMENT_FORMAT_VERSION,
    topicId: params.topicId,
    clausePrefix: params.clausePrefix || '',
    docId: params.docId || '',
    model: params.model,
    temperature: params.temperature,
    thinking: params.thinking,
    modelBaseUrl: params.modelBaseUrl || '',
  });
}

export function getCachedLesson(key: string): CachedLessonPayload | undefined {
  const entry = lessonCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (isExpired(entry)) {
    lessonCache.delete(key);
    return undefined;
  }

  return cloneLessonPayload(entry);
}

export function setCachedLesson(key: string, payload: CachedLessonPayload): CachedLessonPayload {
  const entry: CachedLessonEntry = {
    ...cloneLessonPayload(payload),
    cachedAt: Date.now(),
  };

  lessonCache.set(key, entry);
  pendingLessonCache.delete(key);
  return cloneLessonPayload(entry);
}

export function getPendingLesson(key: string): Promise<CachedLessonPayload> | undefined {
  return pendingLessonCache.get(key);
}

export function setPendingLesson(key: string, pending: Promise<CachedLessonPayload>): void {
  pendingLessonCache.set(key, pending);
}

export function clearPendingLesson(key: string): void {
  pendingLessonCache.delete(key);
}

export function invalidateLessonCache(): void {
  lessonCache.clear();
  pendingLessonCache.clear();
}
