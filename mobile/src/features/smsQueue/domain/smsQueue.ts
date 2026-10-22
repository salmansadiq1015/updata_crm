// SMS queue: text a list of leads from this phone, one lead at a time. Two ways to send:
//  - composer:  the phone's Messages app opens with the text ready; the user taps Send and says
//               whether it went (no SMS permission, works in every build);
//  - automatic: the app sends from the chosen SIM itself (SEND_SMS, client/company builds); the
//               phone reports whether the SIM sent it. Replies always arrive in the Messages app.
// Every SMS is authorised by the CRM first and logged there as a lead communication.

export type QueueMode = 'composer' | 'automatic';

export type QueueLead = { id: string; name: string; city: string | null; hasNumber: boolean };

export type ItemStatus =
  | 'pending'
  | 'composer_open' // waiting for the user to come back from the Messages app
  | 'sending'
  | 'sent' // automatic: the SIM sent it · composer: the user said it was sent
  | 'not_sent'
  | 'unknown' // automatic: no result from the phone in time (never resent automatically)
  | 'skipped'
  | 'blocked'; // the CRM refused (suppressed, no consent, no number)

export type QueueItem = {
  lead: QueueLead;
  status: ItemStatus;
  operationId: string | null;
  /** Server reason codes or a short error, shown to the user. */
  detail: string | null;
  /** Texted from this phone in the last hours: skipped unless the user includes it. */
  recentlyTexted: boolean;
};

// {link} is filled by the CRM at send time (the lead's personal SMS-link-assistant link).
export const PLACEHOLDERS = ['name', 'city', 'company', 'link'] as const;
/** Representative link length for previews and segment counts (22-character token). */
export const SAMPLE_TOKEN = 'Xy7Kp2Qm9Ld4Rt6Vb1Nc8Z';
/** Pause automatic sending after this many operator refusals in a row. */
export const MAX_CONSECUTIVE_FAILURES = 3;
export const AUTOMATIC_GAP_MS = 6_000; // pacing between automatic sends from one SIM
export const RECENT_WINDOW_MS = 12 * 60 * 60_000;

/** Fill {name}, {city} and {company}; {link} stays until the CRM issues it. No dangling punctuation. */
export function personalize(template: string, lead: Pick<QueueLead, 'name' | 'city'>, company = ''): string {
  const values: Record<string, string> = {
    name: lead.name.trim(),
    city: (lead.city ?? '').trim(),
    company: company.trim(),
  };
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key]! : match))
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/,(\s*[,.!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Placeholders in the text that this app cannot fill (shown as a warning, never sent blindly). */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(PLACEHOLDERS);
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].filter((k) => !known.has(k));
}

/** Leads whose value for a used placeholder is empty (their text would read oddly): shown before sending. */
export function missingValues(
  template: string,
  leads: Pick<QueueLead, 'name' | 'city'>[],
): { placeholder: string; names: string[] }[] {
  const used = new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
  const out: { placeholder: string; names: string[] }[] = [];
  if (used.has('city')) {
    const names = leads.filter((lead) => !(lead.city ?? '').trim()).map((lead) => lead.name);
    if (names.length) out.push({ placeholder: 'city', names });
  }
  return out;
}

export function buildQueue(leads: QueueLead[], recentLeadIds: ReadonlySet<string>): QueueItem[] {
  return leads.map((lead) => ({
    lead,
    status: lead.hasNumber ? (recentLeadIds.has(lead.id) ? 'skipped' : 'pending') : 'blocked',
    operationId: null,
    detail: lead.hasNumber ? null : 'NO_NUMBER',
    recentlyTexted: recentLeadIds.has(lead.id),
  }));
}

/** Index of the next lead to text, or -1 when the queue is finished. */
export const nextIndex = (items: QueueItem[]) => items.findIndex((item) => item.status === 'pending');

export function counts(items: QueueItem[]) {
  const by = (status: ItemStatus) => items.filter((item) => item.status === status).length;
  return {
    total: items.length,
    sent: by('sent'),
    notSent: by('not_sent'),
    unknown: by('unknown'),
    skipped: by('skipped'),
    blocked: by('blocked'),
    pending: by('pending') + by('composer_open') + by('sending'),
  };
}

export function setItem(items: QueueItem[], index: number, change: Partial<QueueItem>): QueueItem[] {
  return items.map((item, i) => (i === index ? { ...item, ...change } : item));
}

/** The text as the lead will receive it, with a representative link for the preview. */
export function previewWithLink(text: string, baseUrl: string | null): string {
  const base = (baseUrl || 'https://updata.behjja.com').replace(/\/+$/, '');
  return text.split('{link}').join(`${base}/c/${SAMPLE_TOKEN}`);
}

export const hasLink = (template: string) => template.includes('{link}');

/** Refusal codes the CRM sends back (SMS authorisation / link issuing) that have a readable explanation. */
export const KNOWN_FAILURE_CODES = [
  'NO_NUMBER',
  'SMS_SUPPRESSED',
  'SMS_CONSENT_DENIED',
  'LEAD_SUPPRESSED',
  'LEAD_CONVERTED_PROTECTED',
  'OUTSIDE_CALLING_HOURS',
  'LINK_ASSISTANT_PAUSED',
  'CAMPAIGN_NOT_RUNNING',
  'CAMPAIGN_NOT_WEB_LINK',
  'DAILY_SPEND_CAP_REACHED',
] as const;
export type FailureCode = (typeof KNOWN_FAILURE_CODES)[number];

/**
 * The i18n key explaining an item's failure detail (`smsQueue.reason.<CODE>`), or null when no
 * listed code is known — the raw detail is then shown as is. A detail may list several codes
 * ("SMS_SUPPRESSED, SMS_CONSENT_DENIED"); the first known one wins.
 */
export function failureReasonKey(detail: string | null | undefined): `smsQueue.reason.${FailureCode}` | null {
  if (!detail) return null;
  const known = new Set<string>(KNOWN_FAILURE_CODES);
  const code = detail
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .find((part) => known.has(part)) as FailureCode | undefined;
  return code ? `smsQueue.reason.${code}` : null;
}

/** Progress of the queue: every item that is no longer waiting or in flight counts as processed. */
export function queueProgress(items: QueueItem[]) {
  const c = counts(items);
  const processed = c.total - c.pending;
  return { processed, total: c.total, fraction: c.total ? processed / c.total : 0 };
}
