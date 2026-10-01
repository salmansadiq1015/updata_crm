'use client';

import { createContext, useContext, useCallback, useMemo, useSyncExternalStore } from 'react';
import { translations } from './translations';
import { normalizeGermanOrthography } from './german-orthography';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'updata-locale';
const SUPPORTED_LOCALES = ['de', 'en'];
const DEFAULT_LOCALE = 'de';

/**
 * External store so the hook reads the current locale directly from localStorage
 * (and stays in sync across tabs via the `storage` event). This avoids the
 * common Next.js pitfall of a server render using DEFAULT_LOCALE while the
 * client already has a persisted value — `useSyncExternalStore` returns the
 * server snapshot on the first render, then switches to the client value
 * immediately, in a way that React 19 handles without mismatch warnings.
 */
const localeStore = (() => {
  const listeners = new Set();

  const getSnapshot = () => {
    if (typeof window === 'undefined') return DEFAULT_LOCALE;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved && SUPPORTED_LOCALES.includes(saved) ? saved : DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  };

  const getServerSnapshot = () => DEFAULT_LOCALE;

  const subscribe = (listener) => {
    listeners.add(listener);
    const onStorage = (e) => {
      if (!e || e.key === STORAGE_KEY) listener();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    return () => {
      listeners.delete(listener);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  };

  const set = (next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* blocked — ignore */ }
    listeners.forEach((l) => l());
  };

  return { getSnapshot, getServerSnapshot, subscribe, set };
})();

export function LanguageProvider({ children }) {
  const locale = useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot,
  );

  const setLocale = useCallback((next) => localeStore.set(next), []);

  const toggleLanguage = useCallback(() => {
    const currentIndex = SUPPORTED_LOCALES.indexOf(locale);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % SUPPORTED_LOCALES.length : 0;
    localeStore.set(SUPPORTED_LOCALES[nextIndex]);
  }, [locale]);

  /**
   * Translation helper.
   *
   * Usage:
   *   t('users.title')                      // returns value or, if missing, the key itself
   *   t('users.title', 'Fallback string')   // returns value or fallback when key missing
   *   t('users.template', null, { name })   // interpolates {name} placeholders
   */
  const t = useCallback(
    (key, fallback, vars) => {
      const raw = translations[locale]?.[key] ?? translations[DEFAULT_LOCALE][key];
      let out;
      if (raw !== undefined && raw !== null) {
        out = raw;
      } else if (fallback !== undefined && fallback !== null) {
        out = fallback;
      } else {
        out = key;
      }
      if (vars && typeof out === 'string') {
        out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
      }
      return locale === 'de' ? normalizeGermanOrthography(out) : out;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, language: locale, setLocale, toggleLanguage, t }),
    [locale, setLocale, toggleLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
