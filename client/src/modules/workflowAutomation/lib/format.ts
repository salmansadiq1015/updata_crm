import type { LeadRef, PersonRef } from '../types/workflow-types';

const LOCALE_TAG: Record<string, string> = { de: 'de-CH', en: 'en-GB', fr: 'fr-CH', ar: 'ar' };
export const localeTag = (locale: string) => LOCALE_TAG[locale] || 'en-GB';

export function formatDateTime(value: string | Date | null | undefined, locale: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatRelative(value: string | Date | null | undefined, locale: string, now = Date.now()) {
  if (!value) return '—';
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return '—';
  const diff = (d - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDateTime(value, locale);
}

export function formatNumber(value: number | null | undefined, locale: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}
export function formatPercent(value: number | null | undefined, locale: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(value) + ' %';
}

export const personName = (p: PersonRef | null | undefined) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '');
export const leadName = (l: LeadRef | string | null | undefined, fallback = '') =>
  (l && typeof l === 'object' ? l.name || l.leadNumber || fallback : fallback);
export const refId = (v: { _id: string } | string | null | undefined) => (v && typeof v === 'object' ? v._id : v || '');
export const refName = (v: { name?: string } | string | null | undefined, fallback = '') => (v && typeof v === 'object' ? v.name || fallback : fallback);
