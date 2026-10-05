'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import Cookies from 'js-cookie';
import { translations } from './translations';
import { normalizeGermanOrthography } from './german-orthography';
import { localizeFallback } from './locale-completion';
import {
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  directionFor,
  normalizeLocale,
} from './locale-config';

const LanguageContext = createContext(null);

// Re-export so existing importers of `SUPPORTED_LOCALES` from this module keep
// working now that the constant lives in the shared, server-safe config.
export { SUPPORTED_LOCALES };

// ~1 year, path '/' so every route sees it, Lax so it rides along with the
// top-level navigation that fetches the SSR document (where the server reads it).
const COOKIE_OPTS = Object.freeze({ expires: 365, path: '/', sameSite: 'lax' });

/**
 * Read the locale the client currently prefers. The cookie is the source of
 * truth because it is the same value the server rendered with; a legacy
 * localStorage value is honoured once (and then migrated to the cookie) so
 * users who chose a language before this change keep their preference.
 */
function readClientLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const fromCookie = Cookies.get(LOCALE_COOKIE);
    if (fromCookie && SUPPORTED_LOCALES.includes(fromCookie)) return fromCookie;
    const fromStorage = window.localStorage.getItem(LOCALE_COOKIE);
    if (fromStorage && SUPPORTED_LOCALES.includes(fromStorage)) return fromStorage;
  } catch {
    /* storage/cookies blocked — fall through */
  }
  return DEFAULT_LOCALE;
}

/**
 * Persist the chosen locale to the cookie (the SSR source of truth) and mirror
 * it into localStorage so the `storage` event keeps other tabs in sync.
 */
function writeClientLocale(next) {
  try { Cookies.set(LOCALE_COOKIE, next, COOKIE_OPTS); } catch { /* ignore */ }
  try { window.localStorage.setItem(LOCALE_COOKIE, next); } catch { /* ignore */ }
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.initialLocale] Locale the server root layout read from
 *   the cookie. Using it as the initial state makes the server HTML and this
 *   first client render agree on the language — even for subtrees that hydrate
 *   late inside a Suspense boundary (e.g. `useSearchParams`), which a
 *   client-only, localStorage-derived locale cannot do without a hydration
 *   mismatch.
 */
export function LanguageProvider({ children, initialLocale }) {
  const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));

  // Reconcile with the client's own cookie/localStorage after hydration. This
  // only diverges from `initialLocale` during the one-time migration off the
  // old localStorage-only persistence, or when another tab changed the
  // language — both of which are safe post-hydration updates, never a diff
  // against the server HTML.
  useEffect(() => {
    const client = readClientLocale();
    writeClientLocale(client); // backfill the cookie for migrated/first-time users
    // This is a one-time post-hydration reconciliation with the persisted locale.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState((curr) => (client !== curr ? client : curr));

    const onStorage = (e) => {
      if (!e || e.key === LOCALE_COOKIE) setLocaleState(readClientLocale());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // Mount-only: subsequent changes flow through `setLocale`/`toggleLanguage`
    // or the storage event above.
  }, []);

  const setLocale = useCallback((next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    writeClientLocale(next);
    setLocaleState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLocaleState((curr) => {
      const idx = SUPPORTED_LOCALES.indexOf(curr);
      const next = SUPPORTED_LOCALES[idx >= 0 ? (idx + 1) % SUPPORTED_LOCALES.length : 0];
      writeClientLocale(next);
      return next;
    });
  }, []);

  const dir = directionFor(locale);
  const isRTL = dir === 'rtl';

  /**
   * Keep the document's `dir` and `lang` attributes in sync with the active
   * locale so global RTL (Arabic) and logical CSS utilities work app-wide. The
   * server already sets both from the cookie; this updates them when the locale
   * changes at runtime. Guarded for SSR / no-window and wrapped in try/catch so
   * a locked-down environment can never throw during render.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      document.documentElement.dir = dir;
      document.documentElement.lang = locale;
    } catch {
      /* DOM access blocked — ignore */
    }
  }, [dir, locale]);

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
      if (locale !== 'de' && typeof out === 'string') {
        out = localizeFallback(out, locale);
      }
      if (vars && typeof out === 'string') {
        out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
      }
      if (locale === 'de') return normalizeGermanOrthography(out);
      return out;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, language: locale, dir, isRTL, setLocale, toggleLanguage, t }),
    [locale, dir, isRTL, setLocale, toggleLanguage, t],
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
