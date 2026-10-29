// Shared formatting for the quality, benchmark and experiment views.
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const pct = (value: number | null | undefined, digits = 0) => value == null ? null : `${(value * 100).toFixed(digits)}%`;
export const ms = (value: number | null | undefined) => value == null ? null : value >= 10_000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const rangeFrom = (range: string) => range === 'all' ? undefined : new Date(new Date().setHours(0, 0, 0, 0) - (Number(range) - 1) * 86_400_000).toISOString();
export const languageName = (t: Translate, code: string) => ({ ur: t('aiQuality.lang.ur'), en: t('aiQuality.lang.en'), mixed: t('aiQuality.lang.mixed'), unknown: t('aiQuality.lang.unknown') } as Record<string, string>)[code] || code.toUpperCase();
