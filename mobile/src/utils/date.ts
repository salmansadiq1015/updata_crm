// Locale-aware date formatting with the same Intl tags as the web CRM.
import { INTL_LOCALES, isLocale } from '@/i18n/locales';

function intlLocale(language: string): string {
  return isLocale(language) ? INTL_LOCALES[language] : INTL_LOCALES.en;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `12 Oct 2026` style; null for missing or unparseable input. */
export function formatDate(value: string | Date | null | undefined, language: string): string | null {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(intlLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** `3 hours ago`, `yesterday`, `now`. */
export function formatRelative(
  value: string | Date | null | undefined,
  language: string,
  now: Date = new Date(),
): string | null {
  const date = toDate(value);
  if (!date) return null;
  // Hermes (Android) ships no Intl.RelativeTimeFormat: fall back to a localized
  // absolute date + time rather than crash the screen.
  if (typeof Intl.RelativeTimeFormat !== 'function') {
    return new Intl.DateTimeFormat(intlLocale(language), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(intlLocale(language), { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}
