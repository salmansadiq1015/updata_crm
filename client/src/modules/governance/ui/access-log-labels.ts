import type { AccessLogEntry } from '../types/governance-types';

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const ACTION_FALLBACK: Record<string, string> = {
  'access.granted': 'Opened with a reason',
  'lead.view': 'Viewed the lead',
  'lead.modify': 'Changed the lead',
  'conversation.view': 'Read a conversation',
  'conversation.modify': 'Acted on a conversation',
  'transcript.read': 'Read a call transcript',
  'call.listen': 'Listened to a live call',
  'call.view': 'Viewed call history',
  'call.modify': 'Acted on a call',
  'pii.view': 'Revealed contact details',
  'pii.call': 'Revealed a number to call',
  'pii.sms': 'Revealed a number to text',
  'pii.whatsapp': 'Revealed a number for WhatsApp',
  'pii.email': 'Revealed an e-mail address',
  'data.exported': 'Exported data',
  'export.denied': 'Export refused',
};

/** Human label for an access-log entry's action (translated, with an English fallback). */
export function accessActionLabel(entry: Pick<AccessLogEntry, 'action' | 'piiMasked' | 'eventType'>, t: Translate): string {
  const key = entry.action || entry.eventType;
  const label = t(`governance.action.${key}`, ACTION_FALLBACK[key] ?? key);
  if (key === 'data.exported' && entry.piiMasked !== null) {
    return `${label} · ${entry.piiMasked ? t('governance.log.masked', 'masked') : t('governance.log.unmasked', 'unmasked')}`;
  }
  return label;
}

export const ACCESS_ACTION_KEYS = Object.keys(ACTION_FALLBACK);
