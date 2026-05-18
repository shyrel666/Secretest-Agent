'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TokenUsage, TokenUsageRecord } from '@/lib/token-usage';

export const TOKEN_USAGE_STORAGE_KEY = 'token-usage-storage';

interface TokenUsageStore {
  records: TokenUsageRecord[];
  addRecord: (record: Omit<TokenUsageRecord, 'id' | 'createdAt'>) => void;
  clearRecords: () => void;
  totalUsage: () => TokenUsage;
  latestRecord: () => TokenUsageRecord | undefined;
}

const TOKEN_USAGE_RETENTION_DAYS = 90;
const TOKEN_USAGE_MAX_RECORDS = 1500;

function pruneRecords(records: TokenUsageRecord[]): TokenUsageRecord[] {
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - (TOKEN_USAGE_RETENTION_DAYS - 1));

  return records
    .filter((record) => new Date(record.createdAt).getTime() >= threshold.getTime())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, TOKEN_USAGE_MAX_RECORDS);
}

export const useTokenUsageStore = create<TokenUsageStore>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (record) => {
        set((state) => ({
          records: pruneRecords([
            {
              ...record,
              id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: new Date().toISOString(),
            },
            ...state.records,
          ]),
        }));
      },
      clearRecords: () => set({ records: [] }),
      totalUsage: () => get().records.reduce<TokenUsage>((total, record) => ({
        promptTokens: total.promptTokens + record.promptTokens,
        completionTokens: total.completionTokens + record.completionTokens,
        totalTokens: total.totalTokens + record.totalTokens,
        estimated: total.estimated || record.estimated,
      }), {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimated: false,
      }),
      latestRecord: () => get().records[0],
    }),
    {
      name: TOKEN_USAGE_STORAGE_KEY,
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const mergedState = persistedState && typeof persistedState === 'object'
          ? { ...currentState, ...persistedState }
          : currentState;

        return {
          ...mergedState,
          records: pruneRecords(Array.isArray(mergedState.records) ? mergedState.records : []),
        } as TokenUsageStore;
      },
    },
  ),
);
