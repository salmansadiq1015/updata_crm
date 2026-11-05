import { intlLocaleFor } from '@/lib/i18n/locale-config';

/** A follow-up timestamp in the viewer's (or the planned) timezone; '—' when missing. */
export function formatInZone(iso: string | null, locale: string, timeZone?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(intlLocaleFor(locale), {
      dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch {
    return Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : '—';
  }
}
