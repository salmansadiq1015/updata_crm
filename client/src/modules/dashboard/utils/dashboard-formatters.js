export function formatDashboardNumber(value, locale = 'en') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function formatDashboardCurrency(value, locale = 'en', currency = 'CHF') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatDashboardMetric(value, format, locale) {
  return format === 'currency'
    ? formatDashboardCurrency(value, locale)
    : formatDashboardNumber(value, locale);
}

export function formatDelta(delta) {
  const value = Number(delta) || 0;
  if (value === 0) return '0%';
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`;
}

export function hasSeriesData(series, metrics) {
  return Array.isArray(series) && series.some((point) =>
    metrics.some((metric) => Number(point?.[metric]) !== 0),
  );
}

export function getLocaleCode(locale) {
  if (locale === 'de') return 'de-CH';
  if (locale === 'fr') return 'fr-CH';
  if (locale === 'it') return 'it-CH';
  return 'en-GB';
}
