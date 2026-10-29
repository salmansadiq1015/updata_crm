import { intlLocaleFor } from '@/lib/i18n/locale-config';
import type { RecoveryActionName, RecoveryItem } from './types/sms-ops-types';

/** Translate function shape used across the app: t(key, englishFallback, vars). */
export type T = (key: string, fallback?: string | null, vars?: Record<string, string | number | null | undefined>) => string;

export const CONTACT_REASON_FALLBACK: Record<string, string> = {
  quiet_hours: 'Lead’s quiet hours',
  min_gap: 'Too soon after the last contact',
  daily_limit: 'Daily contact limit reached',
  weekly_limit: 'Weekly contact limit reached',
  channel_daily_limit: 'Daily limit for this channel reached',
  channel_weekly_limit: 'Weekly limit for this channel reached',
  contact_policy_unavailable: 'Contact policy could not be checked',
  lead_unavailable: 'Lead unavailable',
  do_not_contact: 'Do not contact',
  call_suppressed: 'Number blocked for calls',
  channel_suppressed: 'Opted out on this channel',
  consent_revoked: 'Consent revoked',
};
export const HARD_REASONS = new Set(['lead_unavailable', 'do_not_contact', 'call_suppressed', 'channel_suppressed', 'consent_revoked']);
export const contactReason = (t: T, code: string | null | undefined) =>
  (code ? t(`smsOps.reason.${code}`, CONTACT_REASON_FALLBACK[code] ?? code) : '');

export const DEVICE_REASON_FALLBACK: Record<string, string> = {
  offline: 'Offline (no heartbeat for 10+ minutes)',
  missing_permission_send_sms: 'Permission missing: send SMS',
  missing_permission_receive_sms: 'Permission missing: receive SMS',
  missing_permission_read_phone_state: 'Permission missing: phone state / SIM list',
  missing_permission_notifications: 'Permission missing: notifications',
  battery_optimization_on: 'Battery optimisation may stop the agent',
  no_sim: 'No usable SIM',
  no_sim_selected: 'No sending SIM selected',
  airplane_mode: 'Airplane mode is on',
  network_offline: 'No network connection',
  unknown_results_pending: 'Sends with unknown result',
  failed_results_pending: 'Failed sends waiting',
  stale_queue: 'Queue is not moving',
  journal_mismatch: 'Phone and CRM disagree about sent messages',
  resync_pending: 'Resync requested, waiting for the phone',
  outdated_app: 'App version is older than required',
  recent_error: 'Recent error on the phone',
};
export const deviceReason = (t: T, code: string) => t(`smsOps.deviceReason.${code}`, DEVICE_REASON_FALLBACK[code] ?? code);

export const RECOVERY_TYPE_FALLBACK: Record<string, string> = {
  unknown_send: 'Unknown send result',
  unmatched_reply: 'Unmatched reply',
  delivery_failure: 'Delivery failure',
  sync_failure: 'Sync failure',
  provider_failure: 'Provider messaging failure',
};
export const RECOVERY_ACTION_FALLBACK: Record<RecoveryActionName, string> = {
  mark_sent: 'Mark as sent',
  mark_not_sent: 'Mark as not sent',
  resend: 'Resend',
  link_lead: 'Link to a lead',
  retry_other_sim: 'Retry via another SIM',
  request_resync: 'Request device resync',
  retry_sync: 'Retry CRM sync',
  dismiss: 'Dismiss',
};

/**
 * The actions a user may take on an item. The server is authoritative
 * (allowedActions); this only adds the one client-side safety rule: "resend"
 * is never offered for an unknown send unless it was first marked as NOT sent.
 */
export function visibleActions(item: Pick<RecoveryItem, 'type' | 'allowedActions' | 'resolution' | 'status'>): RecoveryActionName[] {
  const actions = item.allowedActions ?? [];
  return actions.filter((a) => {
    if (a !== 'resend') return true;
    return item.type !== 'unknown_send' || item.resolution?.action === 'mark_not_sent';
  });
}

/** Destructive/irreversible actions need an explicit confirmation. */
export const CONFIRM_ACTIONS = new Set<RecoveryActionName>(['mark_sent', 'mark_not_sent', 'resend', 'retry_other_sim', 'dismiss']);

/** "3 min ago" / "in 2 h" without depending on Intl.RelativeTimeFormat availability. */
export function relativeTime(iso: string | null | undefined, locale = 'en', now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff)) return '—';
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];
  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocaleFor(locale), { numeric: 'auto' });
    for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
    return rtf.format(0, 'second');
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatDateTime(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat(intlLocaleFor(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch { return iso; }
}

export function displayValue(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}
