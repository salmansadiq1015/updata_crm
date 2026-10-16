// Non-sensitive, device-local preferences. Persisted to AsyncStorage — never put
// tokens or CRM data here (session material lives in secure storage, server data
// in the TanStack Query cache).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import type { Locale } from '@/i18n/locales';
import { preferencesStorage } from '@/services/storage/preferencesStorage';

export type ThemePreference = 'system' | 'light' | 'dark';

type PreferencesState = {
  theme: ThemePreference;
  /** `null` follows the device language. */
  language: Locale | null;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Locale | null) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: null,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: STORAGE_KEYS.preferences,
      version: 1,
      storage: createJSONStorage(() => preferencesStorage),
      partialize: ({ theme, language }) => ({ theme, language }),
    },
  ),
);

/** Resolves once persisted preferences are loaded (immediately if already loaded). */
export function waitForPreferences(): Promise<void> {
  if (usePreferencesStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = usePreferencesStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

const FLUSH_TIMEOUT_MS = 1_000;

/**
 * Resolve once the current preferences are on disk. `persist` writes
 * asynchronously and exposes no flush, so call this before reloading the app.
 */
export async function flushPreferences(): Promise<void> {
  const { theme, language } = usePreferencesStore.getState();
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const raw = await preferencesStorage.getItem(STORAGE_KEYS.preferences);
    try {
      const stored = raw ? (JSON.parse(raw) as { state?: Partial<PreferencesState> }).state : undefined;
      if (stored?.theme === theme && (stored.language ?? null) === language) return;
    } catch {
      // Partially written value: poll again.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
