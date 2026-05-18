'use client';

type PersistController = {
  setOptions: (options: { name?: string }) => void;
  rehydrate: () => Promise<void> | void;
};

type PersistableStore = {
  persist?: PersistController;
};

export async function initializePersistedStore(
  store: PersistableStore,
  name?: string,
): Promise<void> {
  if (!store.persist) {
    return;
  }

  if (name) {
    store.persist.setOptions({ name });
  }

  await store.persist.rehydrate();
}

export async function initializePersistedStoreForUser(
  store: PersistableStore,
  baseName: string,
  userId: string,
): Promise<void> {
  await initializePersistedStore(store, `${baseName}:${userId}`);
}

export function migrateLocalStorageEntry(
  targetName: string,
  legacyNames: string[],
): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (window.localStorage.getItem(targetName)) {
    return null;
  }

  for (const legacyName of legacyNames) {
    const value = window.localStorage.getItem(legacyName);

    if (!value) {
      continue;
    }

    window.localStorage.setItem(targetName, value);
    return legacyName;
  }

  return null;
}
