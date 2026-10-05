import { intlLocaleFor } from '@/lib/i18n/locale-config';

const DEFAULT_LOCALE = intlLocaleFor('de');

function toIntlLocale(locale) {
  return typeof locale === 'string' && locale.includes('-') ? locale : intlLocaleFor(locale);
}

export function formatNumber(value, { locale = DEFAULT_LOCALE, decimals, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const intlLocale = toIntlLocale(locale);
  const opts = {};
  if (typeof decimals === 'number') {
    opts.minimumFractionDigits = decimals;
    opts.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(intlLocale, opts).format(Number(value));
}

export function formatCurrency(value, { currency = 'CHF', locale = DEFAULT_LOCALE, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const intlLocale = toIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(Number(value));
}

export function formatPercent(value, { locale = DEFAULT_LOCALE, decimals = 1, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const intlLocale = toIntlLocale(locale);
  return new Intl.NumberFormat(intlLocale, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
}
