'use client';

import { useLayoutEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { useAIConfigStore, AI_CONFIG_STORAGE_KEY } from '@/lib/store/ai-config';
import { useAssessmentStore, ASSESSMENT_STORE_KEY } from '@/lib/store/assessment';
import {
  useLearningProgressStore,
  LEARNING_PROGRESS_STORAGE_KEY,
} from '@/lib/store/learning-progress';
import { useTokenUsageStore, TOKEN_USAGE_STORAGE_KEY } from '@/lib/store/token-usage';
import {
  initializePersistedStore,
  initializePersistedStoreForUser,
  migrateLocalStorageEntry,
} from '@/lib/store/persist-user';

interface AppBootstrapProps {
  children: React.ReactNode;
  initialUserId: string;
}

export function AppBootstrap({ children, initialUserId }: AppBootstrapProps) {
  const hasBootstrappedRef = useRef(false);

  useLayoutEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;

    const bootstrap = async () => {
      try {
        const aiConfigLegacyKeys = typeof window === 'undefined'
          ? []
          : Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
            .reduce<string[]>((keys, key) => {
              if (typeof key === 'string' && key.startsWith(`${AI_CONFIG_STORAGE_KEY}:`)) {
                keys.push(key);
              }

              return keys;
            }, []);

        migrateLocalStorageEntry(AI_CONFIG_STORAGE_KEY, [
          `${AI_CONFIG_STORAGE_KEY}:${initialUserId}`,
          ...aiConfigLegacyKeys,
        ]);

        await Promise.all([
          initializePersistedStoreForUser(useAssessmentStore, ASSESSMENT_STORE_KEY, initialUserId),
          initializePersistedStoreForUser(useLearningProgressStore, LEARNING_PROGRESS_STORAGE_KEY, initialUserId),
          initializePersistedStore(useAIConfigStore),
          initializePersistedStoreForUser(useTokenUsageStore, TOKEN_USAGE_STORAGE_KEY, initialUserId),
        ]);
      } catch (error) {
        console.error('[app-bootstrap]', error);
        toast.error(error instanceof Error ? error.message : '系统初始化失败');
      }
    };

    void bootstrap();
  }, [initialUserId]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
