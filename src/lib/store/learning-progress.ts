'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cloneLessonDocument, type LessonDocument } from '@/lib/learning/lesson-document';

export const LEARNING_PROGRESS_STORAGE_KEY = 'learning-progress-storage-v2';

export interface TopicProgress {
  topicId: string;
  startedAt?: string;
  completedAt?: string;
  lastVisitedAt: string;
  completionRate: number;
  lessonDocument?: LessonDocument;
}

export interface AssessmentRecommendation {
  topicIds: string[];
  generatedAt: string;
}

interface LearningProgressStore {
  topics: Record<string, TopicProgress>;
  latestAssessmentRecommendation?: AssessmentRecommendation;
  markTopicStarted: (topicId: string) => void;
  markTopicCompleted: (topicId: string) => void;
  cacheLesson: (topicId: string, lessonDocument: LessonDocument) => void;
  setAssessmentRecommendation: (topicIds: string[]) => void;
  getTopicProgress: (topicId: string) => TopicProgress | undefined;
  resetLearningProgress: () => void;
}

export const useLearningProgressStore = create<LearningProgressStore>()(
  persist(
    (set, get) => ({
      topics: {},
      latestAssessmentRecommendation: undefined,

      markTopicStarted: (topicId) => {
        const now = new Date().toISOString();
        set((state) => ({
          topics: {
            ...state.topics,
            [topicId]: {
              topicId,
              startedAt: state.topics[topicId]?.startedAt || now,
              completedAt: state.topics[topicId]?.completedAt,
              lastVisitedAt: now,
              completionRate: Math.max(state.topics[topicId]?.completionRate || 0, 20),
              lessonDocument: state.topics[topicId]?.lessonDocument
                ? cloneLessonDocument(state.topics[topicId].lessonDocument)
                : undefined,
            },
          },
        }));
      },

      markTopicCompleted: (topicId) => {
        const now = new Date().toISOString();
        set((state) => ({
          topics: {
            ...state.topics,
            [topicId]: {
              topicId,
              startedAt: state.topics[topicId]?.startedAt || now,
              completedAt: now,
              lastVisitedAt: now,
              completionRate: 100,
              lessonDocument: state.topics[topicId]?.lessonDocument
                ? cloneLessonDocument(state.topics[topicId].lessonDocument)
                : undefined,
            },
          },
        }));
      },

      cacheLesson: (topicId, lessonDocument) => {
        const now = new Date().toISOString();
        set((state) => ({
          topics: {
            ...state.topics,
            [topicId]: {
              topicId,
              startedAt: state.topics[topicId]?.startedAt || now,
              completedAt: state.topics[topicId]?.completedAt,
              lastVisitedAt: now,
              completionRate: Math.max(state.topics[topicId]?.completionRate || 0, 60),
              lessonDocument: cloneLessonDocument(lessonDocument),
            },
          },
        }));
      },

      setAssessmentRecommendation: (topicIds) => {
        const uniqueTopicIds = Array.from(new Set(topicIds.filter(Boolean)));

        set({
          latestAssessmentRecommendation: uniqueTopicIds.length > 0
            ? {
                topicIds: uniqueTopicIds,
                generatedAt: new Date().toISOString(),
              }
            : undefined,
        });
      },

      getTopicProgress: (topicId) => get().topics[topicId],

      resetLearningProgress: () => {
        set({ topics: {}, latestAssessmentRecommendation: undefined });
      },
    }),
    {
      name: LEARNING_PROGRESS_STORAGE_KEY,
      skipHydration: true,
    },
  ),
);
