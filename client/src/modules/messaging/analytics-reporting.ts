export type AnalyticsRange = { from: string; to: string };
export type AnalyticsPreset = 'all' | '7d' | '30d' | '90d' | 'custom';

const dateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function analyticsPresetRange(preset: AnalyticsPreset, now = new Date()): AnalyticsRange {
  if (preset === 'all' || preset === 'custom') return { from: '', to: '' };
  const days = Number(preset.slice(0, -1));
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { from: dateInputValue(from), to: dateInputValue(now) };
}

export function isAnalyticsRangeValid({ from, to }: AnalyticsRange) {
  return !from || !to || from <= to;
}

export function buildAnalyticsParams({ from, to }: AnalyticsRange) {
  if (!isAnalyticsRangeValid({ from, to })) return null;
  return {
    ...(from ? { from: new Date(`${from}T00:00:00.000`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
  };
}

export function formatCostBuckets(costs: Array<{ currency: string; actual: number; estimated: number }>) {
  if (!costs.length) return 'No cost evidence';
  return costs.map(({ currency, actual, estimated }) => {
    const formatter = new Intl.NumberFormat(undefined, {
      style: currency === 'UNKNOWN' ? 'decimal' : 'currency',
      ...(currency === 'UNKNOWN' ? {} : { currency }),
      maximumFractionDigits: 4,
    });
    return `${formatter.format(actual)} actual / ${formatter.format(estimated)} estimate${currency === 'UNKNOWN' ? ' (currency unknown)' : ''}`;
  }).join(' · ');
}
