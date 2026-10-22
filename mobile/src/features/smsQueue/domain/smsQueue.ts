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

export const PLACEHOLDERS = ['name', 'city'] as const;
export const AUTOMATIC_GAP_MS = 6_000; // pacing between automatic sends from one SIM
export const RECENT_WINDOW_MS = 12 * 60 * 60_000;

/** Fill {name} and {city}; an empty value never leaves a dangling space or comma. */
export function personalize(template: string, lead: Pick<QueueLead, 'name' | 'city'>): string {
  const values: Record<string, string> = { name: lead.name.trim(), city: (lead.city ?? '').trim() };
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
