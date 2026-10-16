// Same locale set as the web CRM (client/src/lib/i18n/locale-config.js).
export const LOCALES = ['de', 'en', 'fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Each language named in itself, so a user can always find their own. */
export const LOCALE_NAMES: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

/** BCP-47 tags for Intl, matching the web CRM's formatting (Swiss variants). */
export const INTL_LOCALES: Record<Locale, string> = {
  de: 'de-CH',
  en: 'en-GB',
  fr: 'fr-CH',
  ar: 'ar',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isRtlLocale(locale: Locale): boolean {
  return locale === 'ar';
}
