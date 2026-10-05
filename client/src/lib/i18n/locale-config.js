// Framework-agnostic locale constants shared by the SERVER root layout (which
// reads the locale cookie to render the correct <html lang>/dir and seed the
// provider) and the CLIENT LanguageProvider. Keeping them here — in a module
// with no 'use client' directive and no React imports — lets the server
// component import them without pulling the client provider into the server
// bundle, so both sides derive the locale from a single source of truth.

/** Name of the cookie (and the legacy localStorage key) holding the locale. */
export const LOCALE_COOKIE = 'updata-locale';

export const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'ar'];
export const DEFAULT_LOCALE = 'en';

const INTL_LOCALE_MAP = {
  de: 'de-CH',
  en: 'en-GB',
  fr: 'fr-CH',
  ar: 'ar',
};

/** Locales that render right-to-left. */
const RTL_LOCALES = ['ar'];

/** Derive the text direction for a locale. */
export function directionFor(locale) {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

/** Coerce any value to a supported locale, falling back to the default. */
export function normalizeLocale(value) {
  if (SUPPORTED_LOCALES.includes(value)) return value;
  if (typeof value === 'string') {
    const base = value.split('-')[0];
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Map app locale identifiers to regional Intl locale tags. */
export function intlLocaleFor(locale) {
  return INTL_LOCALE_MAP[normalizeLocale(locale)] || INTL_LOCALE_MAP[DEFAULT_LOCALE];
}
