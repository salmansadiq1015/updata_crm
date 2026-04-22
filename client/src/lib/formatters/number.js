const DEFAULT_LOCALE = 'de-CH';

export function formatNumber(value, { locale = DEFAULT_LOCALE, decimals, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const opts = {};
  if (typeof decimals === 'number') {
    opts.minimumFractionDigits = decimals;
    opts.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(locale, opts).format(Number(value));
}

export function formatCurrency(value, { currency = 'CHF', locale = DEFAULT_LOCALE, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value));
}

export function formatPercent(value, { locale = DEFAULT_LOCALE, decimals = 1, fallback = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
}
