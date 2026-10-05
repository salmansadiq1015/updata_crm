import { intlLocaleFor } from '@/lib/i18n/locale-config';

const DEFAULT_LOCALE = intlLocaleFor('de');

function toIntlLocale(locale) {
  return typeof locale === 'string' && locale.includes('-') ? locale : intlLocaleFor(locale);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, { locale = DEFAULT_LOCALE, fallback = '—' } = {}) {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString(toIntlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value, { locale = DEFAULT_LOCALE, fallback = '—' } = {}) {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(toIntlLocale(locale), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * "vor 3 Tagen" / "3 days ago" style relative formatting.
 * Uses Intl.RelativeTimeFormat; falls back gracefully.
 */
export function formatDateRelative(value, { locale = DEFAULT_LOCALE, fallback = '—' } = {}) {
  const d = toDate(value);
  if (!d) return fallback;
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  const units = [
    { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
    { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
    { unit: 'day', ms: 24 * 60 * 60 * 1000 },
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
  ];

  for (const { unit, ms } of units) {
    if (abs >= ms) {
      const value = Math.round(diffMs / ms);
      try {
        return new Intl.RelativeTimeFormat(toIntlLocale(locale), { numeric: 'auto' }).format(value, unit);
      } catch {
        return formatDate(d, { locale, fallback });
      }
    }
  }

  try {
    return new Intl.RelativeTimeFormat(toIntlLocale(locale), { numeric: 'auto' }).format(0, 'second');
  } catch {
    return formatDate(d, { locale, fallback });
  }
}

/** ISO-friendly YYYY-MM-DD suitable for <input type="date"> and filename suffixes. */
export function formatISODate(value, { fallback = '' } = {}) {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toISOString().split('T')[0];
}
