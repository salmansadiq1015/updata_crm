/**
 * Pure helpers for the Incoming Calls workspace: filter → query mapping, label keys,
 * status tones, formatters, rule/settings payload builders and the merged transcript
 * timeline. No React, no network — covered by __tests__/inbound-domain.test.ts.
 */
import type {
  AiStatus, AudioStatus, CallEvent, CallStatus, ControlKind, DeviceAgentRow, DeviceSim, InboundCallRow, InboundDevice, InboundFilters,
  InboundRule, InboundSettings, InboundSort, LiveCall, TranscriptTurn,
} from './types/inbound-call-types';
import { CLOSING_STANDARD_KEYS, DEFAULT_STATUS_BY_RESULT, MAX_CLOSING_QUESTIONS, OUTCOMES, ROUTING_RESULT_KEYS, type ClosingQuestion, type QuestionTemplate } from './types/inbound-call-types';
import type { AnalyzedCallCost } from '@/modules/aiCalling/types/ai-calling-types';

export type T = (key: string, fallback?: string, vars?: Record<string, string | number | null | undefined>) => string;

/** Inbound outcomes in display order (analytics outcome bars). */
export const OUTCOME_ORDER: string[] = [...OUTCOMES];

export const TERMINAL_STATUSES = new Set<CallStatus>(['COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED']);
export const RINGING_STATUSES = new Set<CallStatus>(['DETECTED', 'RECEIVED', 'IDENTIFYING', 'QUEUED', 'RINGING', 'ANSWERING']);
export const LIVE_STATUSES = new Set<CallStatus>(['ANSWERED', 'CONNECTING_AUDIO', 'AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING']);

// ------------------------------------------------------------------ filters

/** Date input (yyyy-mm-dd) → ISO bounds in the viewer's local day. */
export function dayStartIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
export function dayEndIso(day: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const d = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** UI filter state (local days, empty strings) → the API query (only set keys, ISO dates, tz). */
export function filtersToQuery(filters: InboundFilters, extra: { page?: number; limit?: number; sort?: InboundSort; tz?: string } = {}): Record<string, string | number> {
  const q: Record<string, string | number> = {};
  const search = filters.search?.trim();
  if (search) q.search = search.slice(0, 80);
  const from = filters.from ? dayStartIso(filters.from) : undefined;
  const to = filters.to ? dayEndIso(filters.to) : undefined;
  if (from) q.from = from;
  if (to) q.to = to;
  for (const key of ['handledBy', 'callerType', 'outcome', 'qualification', 'inquiry', 'agentId', 'deviceId', 'status', 'workStatus', 'assignedTo'] as const) {
    const v = filters[key];
    if (v) q[key] = v;
  }
  if (filters.simSlot != null && /^[0-4]$/.test(String(filters.simSlot))) q.simSlot = Number(filters.simSlot);
  if (filters.leadCreated) q.leadCreated = 'true';
  if (extra.page) q.page = extra.page;
  if (extra.limit) q.limit = extra.limit;
  if (extra.sort) q.sort = extra.sort;
  if (extra.tz) q.tz = extra.tz;
  return q;
}

export function activeFilterCount(filters: InboundFilters): number {
  return (['search', 'from', 'to', 'handledBy', 'callerType', 'simSlot', 'outcome', 'qualification', 'inquiry', 'agentId', 'deviceId', 'workStatus', 'assignedTo'] as const)
    .filter((k) => Boolean(String(filters[k] ?? '').trim())).length + (filters.leadCreated ? 1 : 0);
}

/** Quick ranges for the overview / analytics date filter. */
export function rangeFor(preset: 'today' | '7d' | '30d' | '90d' | 'all', now = new Date()): { from: string; to: string } {
  if (preset === 'all') return { from: '', to: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const days = { today: 0, '7d': 6, '30d': 29, '90d': 89 }[preset];
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: fmt(start), to: fmt(now) };
}

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// ------------------------------------------------------------------ formatters

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const s = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function formatRate(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatTime(value: string | null | undefined, locale?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}

/** SIM slots are 0-based on the wire; people count from 1. */
export function simLabel(slot: number | null | undefined, label?: string | null): string {
  if (label && label.trim()) return label.trim();
  return slot == null ? '—' : `SIM ${Number(slot) + 1}`;
}

/** A reported SIM's display name: its label, else its carrier, else "SIM n". */
export function simName(sim: Pick<DeviceSim, 'slot' | 'label' | 'carrier'>): string {
  return sim.label?.trim() || sim.carrier?.trim() || `SIM ${Number(sim.slot) + 1}`;
}

/** The SIM name for a slot on one phone (from what that phone reported), else the stored label, else "SIM n". */
export function deviceSimLabel(devices: Pick<InboundDevice, 'id' | 'sims'>[] | undefined, deviceId: string | null | undefined, slot: number | null | undefined, stored?: string | null): string {
  if (slot == null) return '—';
  const sim = devices?.find((d) => d.id === deviceId)?.sims?.find((x) => x.slot === slot);
  return sim ? simName(sim) : simLabel(slot, stored);
}

/**
 * SIM slots actually reported across phones (for the History filter and rule SIM
 * conditions). One option per slot; different names for the same slot on different
 * phones are joined ("Swisscom / Salt"). Empty when no phone has reported SIMs.
 */
export function reportedSimOptions(devices: Pick<InboundDevice, 'sims'>[] | undefined): Array<{ slot: number; label: string }> {
  const bySlot = new Map<number, string[]>();
  for (const d of devices ?? []) for (const sim of d.sims ?? []) {
    const names = bySlot.get(sim.slot) ?? [];
    const name = simName(sim);
    if (!names.includes(name)) names.push(name);
    bySlot.set(sim.slot, names);
  }
  return [...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([slot, names]) => ({ slot, label: names.join(' / ') }));
}

/** "Office phone", "Office phone · Swisscom" — the phones/SIMs explicitly assigned to an agent. */
export function agentAssignments(agentId: string, rows: DeviceAgentRow[], devices: Pick<InboundDevice, 'id' | 'name' | 'sims'>[]): string[] {
  return rows.filter((r) => r.agentId && String(r.agentId) === agentId && r.aiEnabled !== false).map((r) => {
    const device = devices.find((d) => d.id === String(r.deviceId));
    const name = device?.name || '—';
    return r.simSlot == null ? name : `${name} · ${deviceSimLabel(devices, String(r.deviceId), r.simSlot)}`;
  });
}

export function callerDisplay(row: Pick<InboundCallRow, 'caller' | 'lead'>, t: T): string {
  return row.caller.name || row.lead?.name || (row.caller.presentation && row.caller.presentation !== 'available'
    ? t('inbound.caller.withheld', 'Withheld number') : row.caller.number || t('inbound.caller.unknown', 'Unknown caller'));
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const s = String(value).replace(/[_:]+/g, ' ').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------------ labels (i18n keys)

export const labelKey = {
  status: (s: string) => `inbound.status.${s}`,
  ai: (s: string) => `inbound.ai.${s}`,
  audio: (s: string) => `inbound.audio.${s}`,
  outcome: (s: string) => `inbound.outcome.${s}`,
  inquiry: (s: string) => `inbound.inquiry.${s}`,
  qualification: (s: string) => `inbound.qualification.${s}`,
  ruleAction: (s: string) => `inbound.ruleAction.${s}`,
  ruleCallerType: (s: string) => `inbound.ruleCallerType.${s}`,
  callerType: (s: string) => `inbound.callerType.${s}`,
  recommendation: (s: string) => `inbound.recommendation.${s}`,
  field: (s: string) => `inbound.field.${s}`,
  readiness: (s: string) => `inbound.readiness.${s}`,
  reason: (s: string) => `inbound.reason.${s}`,
  handledBy: (s: string) => `inbound.handledBy.${s}`,
  verification: (s: string) => `inbound.verification.${s}`,
  answerStatus: (s: string) => `inbound.answerStatus.${s}`,
  handoff: (s: string) => `inbound.handoff.${s}`,
  leadCreation: (s: string) => `inbound.leadCreation.${s}`,
  control: (s: string) => `inbound.control.${s}`,
  work: (s: string) => `inbound.work.${s}`,
  routingResult: (s: string) => `inbound.routing.result.${s}`,
  questionType: (s: string) => `inbound.closing.type.${s}`,
  closingStatus: (s: string) => `inbound.closing.status.${s}`,
  standardKey: (s: string) => `inbound.closing.key.${s}`,
};

/** Translate an enum value with a readable fallback for values the client does not know yet. */
export function enumLabel(t: T, kind: keyof typeof labelKey, value: string | null | undefined, empty = '—'): string {
  if (value == null || value === '') return empty;
  return t(labelKey[kind](String(value)), humanize(String(value)));
}

// ------------------------------------------------------------------ tones (logo blue/cyan; never purple)

export type Tone = 'neutral' | 'info' | 'live' | 'success' | 'warning' | 'danger';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  live: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

export function statusTone(status: CallStatus | string | null | undefined): Tone {
  if (!status) return 'neutral';
  if (status === 'COMPLETED') return 'success';
  if (status === 'MISSED' || status === 'INTERRUPTED') return 'warning';
  if (status === 'FAILED' || status === 'REJECTED') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  if (RINGING_STATUSES.has(status as CallStatus)) return 'info';
  return 'live';
}

/** AI is "connected" ONLY when the server says so — never inferred from call status. */
export function aiTone(ai: AiStatus | string | null | undefined): Tone {
  if (ai === 'connected' || ai === 'speaking' || ai === 'listening') return 'success';
  if (ai === 'waiting' || ai === 'connecting') return 'info';
  if (ai === 'unavailable' || ai === 'failed') return 'danger';
  if (ai === 'handed_off') return 'warning';
  return 'neutral';
}
export const isAiConnected = (ai: AiStatus | string | null | undefined) => ai === 'connected' || ai === 'speaking' || ai === 'listening';

export function audioTone(audio: AudioStatus | string | null | undefined): Tone {
  if (audio === 'connected') return 'success';
  if (audio === 'connecting' || audio === 'reconnecting') return 'info';
  if (audio === 'lost') return 'danger';
  return 'neutral';
}

export function qualificationTone(q: string | null | undefined): Tone {
  if (q === 'QUALIFIED') return 'success';
  if (q === 'PARTIALLY_QUALIFIED' || q === 'CALLBACK_REQUIRED') return 'info';
  if (q === 'SUPPORT_REQUIRED') return 'warning';
  if (q === 'NOT_QUALIFIED') return 'danger';
  return 'neutral';
}

export function workTone(s: string | null | undefined): Tone {
  if (s === 'new') return 'info';
  if (s === 'in_progress') return 'live';
  if (s === 'follow_up' || s === 'waiting_on_caller') return 'warning';
  if (s === 'resolved') return 'success';
  if (s === 'spam') return 'danger';
  return 'neutral';
}

export function outcomeTone(o: string | null | undefined): Tone {
  if (o === 'handled_by_ai' || o === 'handled_by_human' || o === 'transferred') return 'success';
  if (o === 'missed' || o === 'unanswered' || o === 'interrupted') return 'warning';
  if (o === 'failed' || o === 'rejected') return 'danger';
  return 'neutral';
}

// ------------------------------------------------------------------ live control

/** Which owner controls the server will accept right now (mirrors inboundCall.service control()). */
export function allowedControls(call: Pick<LiveCall, 'status' | 'handling'>): ControlKind[] {
  if (TERMINAL_STATUSES.has(call.status) || call.status === 'WRAPPING_UP') return [];
  const ringing = RINGING_STATUSES.has(call.status);
  const out: ControlKind[] = [];
  if (ringing && call.handling !== 'ai' && call.status !== 'ANSWERING') out.push('answer');
  if (ringing) out.push('reject');
  if (['AI_ACTIVE', 'CONNECTING_AUDIO', 'ANSWERED', 'TRANSFERRING'].includes(call.status)) out.push('takeover');
  if (!ringing) out.push('hangup');
  return out;
}

// ------------------------------------------------------------------ transcript timeline

export type TimelineItem =
  | { kind: 'turn'; at: string | null; turn: TranscriptTurn }
  | { kind: 'event'; at: string | null; event: CallEvent }
  | { kind: 'language'; at: string | null; from: string; to: string };

/** Conversation turns interleaved with system events and language switches, by time (stable). */
export function buildConversationTimeline(
  transcript: TranscriptTurn[] = [], events: CallEvent[] = [], switches: Array<{ from: string; to: string; at: string }> = [],
): TimelineItem[] {
  const items: Array<TimelineItem & { order: number }> = [];
  let order = 0;
  for (const turn of transcript) items.push({ kind: 'turn', at: turn.at, turn, order: order++ });
  for (const event of events) {
    // Language switches are rendered from `switches` (with from/to); skip their duplicate event.
    if (event.type === 'language_switch' && switches.length) continue;
    items.push({ kind: 'event', at: event.at, event, order: order++ });
  }
  for (const s of switches) items.push({ kind: 'language', at: s.at, from: s.from, to: s.to, order: order++ });
  const ts = (v: string | null) => { const n = v ? new Date(v).getTime() : NaN; return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n; };
  return items.sort((a, b) => (ts(a.at) - ts(b.at)) || (a.order - b.order)).map(({ order: _o, ...rest }) => rest as TimelineItem);
}

/** "status:AI_ACTIVE" → status key; other events → event key. */
export function eventLabel(event: CallEvent, t: T): string {
  if (event.type.startsWith('status:')) {
    const status = event.type.slice('status:'.length);
    return t('inbound.detail.statusChanged', 'Status: {status}', { status: enumLabel(t, 'status', status) });
  }
  return t(`inbound.event.${event.type}`, humanize(event.type));
}

// ------------------------------------------------------------------ lists / csv

/** Free text (comma, semicolon or newline separated) → trimmed unique entries. */
export function parseList(text: string): string[] {
  return [...new Set(String(text || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Selected rows → CSV text (the server export works on filters, not ids). */
export function rowsToCsv(rows: InboundCallRow[], t: T): string {
  const headers = ['date', 'caller_name', 'caller_number', 'caller_type', 'lead_number', 'lead_name', 'status', 'outcome', 'answered_by', 'agent', 'device', 'sim', 'duration_seconds', 'primary_inquiry', 'qualification'];
  const lines = rows.map((r) => [
    r.detectedAt, r.caller.name ?? r.lead?.name ?? '', r.caller.number ?? '', r.callerType ?? '', r.lead?.number ?? '', r.lead?.name ?? '',
    enumLabel(t, 'status', r.status, ''), enumLabel(t, 'outcome', r.outcome, ''), r.answeredBy ?? '', r.agent?.name ?? '', r.device?.name ?? '',
    r.sim.slot == null ? '' : simLabel(r.sim.slot, r.sim.label), r.durationSeconds ?? 0, r.primaryInquiry ?? '', r.qualification ?? '',
  ].map(csvCell).join(','));
  return `﻿${[headers.join(','), ...lines].join('\n')}`;
}

// ------------------------------------------------------------------ rules

export type RuleDraft = {
  id?: string; name: string; enabled: boolean; priority: number; action: InboundRule['action']; agentId: string;
  callerType: InboundRule['conditions']['callerType']; numbers: string; prefixes: string; deviceIds: string[]; simSlots: number[];
  hours: 'any' | 'inside' | 'outside'; leadStatuses: string[];
};

export function ruleToDraft(rule?: InboundRule | null, nextPriority = 100): RuleDraft {
  const c = rule?.conditions;
  return {
    id: rule?.id, name: rule?.name ?? '', enabled: rule?.enabled ?? true, priority: rule?.priority ?? nextPriority,
    action: rule?.action ?? 'ai_answer', agentId: rule?.agentId ? String(rule.agentId) : '',
    callerType: c?.callerType ?? 'any', numbers: (c?.numbers ?? []).join('\n'), prefixes: (c?.numberPrefixes ?? []).join(', '),
    deviceIds: (c?.deviceIds ?? []).map(String), simSlots: [...(c?.simSlots ?? [])],
    hours: c?.withinBusinessHours === true ? 'inside' : c?.withinBusinessHours === false ? 'outside' : 'any',
    leadStatuses: [...(c?.leadStatuses ?? [])],
  };
}

/** Exactly the keys the API's saveRule schema accepts (unknown keys are rejected). */
export function rulePayload(d: RuleDraft) {
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name.trim(),
    enabled: d.enabled,
    priority: Math.max(0, Math.min(1000, Math.round(Number(d.priority) || 0))),
    conditions: {
      callerType: d.callerType,
      numbers: parseList(d.numbers).slice(0, 200),
      numberPrefixes: parseList(d.prefixes).slice(0, 50),
      deviceIds: d.deviceIds.slice(0, 20),
      simSlots: [...new Set(d.simSlots)].sort(),
      withinBusinessHours: d.hours === 'inside' ? true : d.hours === 'outside' ? false : null,
      leadStatuses: d.leadStatuses,
    },
    action: d.action,
    agentId: d.action === 'ai_answer' && d.agentId ? d.agentId : null,
  };
}

/** Evaluation order: ascending priority, then creation order (ruleEngine). */
export function sortRules(rules: InboundRule[] = []): InboundRule[] {
  return rules.map((r, i) => ({ r, i })).sort((a, b) => (a.r.priority ?? 100) - (b.r.priority ?? 100) || a.i - b.i).map((x) => x.r);
}

// ------------------------------------------------------------------ settings

export const EDITABLE_SETTINGS = [
  'enabled', 'organizationName', 'defaultRegion', 'defaultAgentId', 'deviceAgents', 'answerDelaySeconds', 'ringTimeoutSeconds',
  'maxConcurrentAiSessions', 'fallbackAction', 'businessHours', 'outsideHoursAction', 'blockedNumbers', 'blockedAction',
  'leadCreation', 'qualification', 'automation', 'handoffWaitSeconds', 'aiDisclosure', 'transcriptRetentionDays',
] as const;
type EditableKey = (typeof EDITABLE_SETTINGS)[number];

const PICK: Partial<Record<EditableKey, string[]>> = {
  businessHours: ['enabled', 'timezone', 'days', 'start', 'end'],
  qualification: ['required', 'anyOf', 'promoteLeadStatus'],
  automation: ['createFollowUps', 'followUpFor', 'returnMissedCalls', 'notifyMissed', 'notifyHandoff', 'notifyQualified', 'autoSendSms', 'autoSendEmail'],
};

function normalizeSetting(key: EditableKey, value: unknown): unknown {
  if (key === 'deviceAgents') {
    return ((value as DeviceAgentRow[]) || []).map((r) => ({ deviceId: String(r.deviceId), simSlot: r.simSlot ?? null, agentId: r.agentId ? String(r.agentId) : null, aiEnabled: r.aiEnabled !== false }));
  }
  if (key === 'defaultAgentId') return value ? String(value) : null;
  const fields = PICK[key];
  if (fields && value && typeof value === 'object') return Object.fromEntries(fields.filter((f) => f in (value as object)).map((f) => [f, (value as Record<string, unknown>)[f]]));
  return value;
}

/** Only the changed editable keys + the version the draft was based on (409 on mismatch). */
export function settingsPatch(base: InboundSettings, draft: InboundSettings): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE_SETTINGS) {
    const a = normalizeSetting(key, base[key]);
    const b = normalizeSetting(key, draft[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) patch[key] = b;
  }
  if (!Object.keys(patch).length) return null;
  return { ...patch, version: base.version };
}

/**
 * Device/SIM agent matrix → the stored rows. A row is kept only when it differs from
 * "use the default agent, AI on" (simSlot null = every SIM on that phone).
 */
export function compactDeviceAgents(rows: DeviceAgentRow[]): DeviceAgentRow[] {
  const seen = new Set<string>();
  const out: DeviceAgentRow[] = [];
  for (const r of rows) {
    const key = `${r.deviceId}:${r.simSlot ?? '*'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!r.agentId && r.aiEnabled !== false) continue;
    out.push({ deviceId: r.deviceId, simSlot: r.simSlot ?? null, agentId: r.agentId || null, aiEnabled: r.aiEnabled !== false });
  }
  return out.slice(0, 40);
}

export function deviceAgentFor(rows: DeviceAgentRow[], deviceId: string, simSlot: number | null): DeviceAgentRow {
  return rows.find((r) => String(r.deviceId) === deviceId && (r.simSlot ?? null) === simSlot) ?? { deviceId, simSlot, agentId: null, aiEnabled: true };
}

export function upsertDeviceAgent(rows: DeviceAgentRow[], next: DeviceAgentRow): DeviceAgentRow[] {
  const rest = rows.filter((r) => !(String(r.deviceId) === next.deviceId && (r.simSlot ?? null) === next.simSlot));
  return compactDeviceAgents([...rest, next]);
}

export const isConflict = (error: unknown) => Boolean(error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === 409);
export const errorMessage = (error: unknown, fallback: string) =>
  (error && typeof error === 'object' && 'message' in error && (error as { message?: unknown }).message ? String((error as { message: unknown }).message) : fallback);

/** The inbound call id from a /incoming-calls?call=<id> link. */
export function callIdFromSearch(search: string): string | null {
  try {
    const v = new URLSearchParams(search).get('call');
    return v && /^[a-f0-9]{24}$/i.test(v) ? v : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ cost

/** Incoming calls: same evidence rules, translated; a person-answered call has no AI cost by design. */
export const inboundCostSourceText = (call: { cost: Pick<AnalyzedCallCost, 'source' | 'unpriced' | 'model' | 'pricedAs'>; durationSeconds: number; answeredBy?: string | null }, tx: T) => {
  const c = call.cost;
  if (c.source === 'token_usage') return c.unpriced
    ? tx('inbound.costs.src.partial', 'Cost is incomplete: some model, provider or token details could not be priced. Recorded usage is preserved; this is not a zero-cost call.')
    : tx('inbound.costs.src.tokens', 'Estimated from {model} token usage at list prices. Input caching is discounted. This is not a provider invoice amount.', { model: c.pricedAs && c.pricedAs !== c.model ? `${c.model || '—'} (${c.pricedAs})` : c.model || '—' });
  if (c.source === 'per_minute_estimate') return tx('inbound.costs.src.perMinute', 'Estimated from the configured blended per-minute rate.');
  if (c.source === 'provider_reported') return tx('inbound.costs.src.reported', 'Reported by the provider.');
  if (call.answeredBy === 'human') return tx('inbound.costs.src.human', 'Answered by a person on the phone: no AI usage, no AI cost.');
  return call.durationSeconds ? tx('inbound.costs.src.none', 'No usage was reported for this call, so no cost was recorded.') : tx('inbound.costs.src.notAnswered', 'The call was not answered by the AI, so nothing was consumed.');
};


/** Money with 4 decimals under $1 (per-call costs are cents), like the AI calling analytics. */
export function formatCost(value: number | null | undefined, currency = 'USD', locale?: string): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const digits = value === 0 ? 2 : Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Cost per minute of AI talk; null without talk time. */
export const costPerMinute = (amount: number | null | undefined, seconds: number | null | undefined) => (amount != null && seconds && seconds > 0 ? amount / (seconds / 60) : null);

// ------------------------------------------------------------------ review workflow

/** Where a follow-up's lead comes from when the call has none: an existing (matched) lead, or a new one. */
export type LeadChoice = { kind: 'lead'; leadId: string } | { kind: 'create' } | null;
export function leadTarget(choice: LeadChoice): { leadId?: string; createLead?: boolean } {
  if (choice?.kind === 'lead') return { leadId: choice.leadId };
  if (choice?.kind === 'create') return { createLead: true };
  return {};
}

/** The PATCH /:id/work body: only what changed (+ an optional note); null when nothing did. */
export function workPatch(current: { status: string | null; assigneeId: string | null }, next: { status: string; assigneeId: string; note: string }) {
  const body: { status?: string; assignedTo?: string | null; note?: string } = {};
  if (next.status && next.status !== current.status) body.status = next.status;
  if ((next.assigneeId || null) !== (current.assigneeId || null)) body.assignedTo = next.assigneeId || null;
  if (!Object.keys(body).length) return null;
  if (next.note.trim()) body.note = next.note.trim().slice(0, 1000);
  return body;
}

/** Only the results the owner changed from the defaults are stored on the agent. */
export function statusByResultPatch(map: Partial<Record<string, string>>, defaults: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([k, v]) => v && v !== defaults[k])) as Record<string, string>;
}

// ------------------------------------------------------------------ closing questions

const slugKey = (v: string) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
/** The key a question saves to: its standard field, else custom_<slug of label> (the server's rule). */
export function closingKey(q: Pick<ClosingQuestion, 'key' | 'label'>): string {
  const k = String(q.key || '').trim();
  if ((CLOSING_STANDARD_KEYS as readonly string[]).includes(k)) return k;
  if (k.startsWith('custom_')) return k;
  return `custom_${slugKey(k || q.label) || 'question'}`;
}

/** Append a template's questions, skipping keys already present, up to the limit. */
export function addTemplateQuestions(current: ClosingQuestion[], template: Pick<QuestionTemplate, 'questions'>): { questions: ClosingQuestion[]; added: number; skipped: number } {
  const keys = new Set(current.map(closingKey));
  const out = [...current];
  let added = 0; let skipped = 0;
  for (const q of template.questions) {
    const key = closingKey(q);
    if (keys.has(key) || out.length >= MAX_CLOSING_QUESTIONS) { skipped += 1; continue; }
    keys.add(key);
    out.push({ ...q, key, options: [...(q.options ?? [])] });
    added += 1;
  }
  return { questions: out, added, skipped };
}

/** The agent PATCH payload for closing questions: trimmed, valid, unique keys, max 20. */
export function closingQuestionsPayload(list: ClosingQuestion[]): ClosingQuestion[] {
  const seen = new Set<string>();
  const out: ClosingQuestion[] = [];
  for (const q of list) {
    const label = q.label.trim().slice(0, 80);
    const question = q.question.trim().slice(0, 300);
    if (!label || !question) continue;
    const key = closingKey({ key: q.key, label });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, question, type: q.type, required: Boolean(q.required), options: q.type === 'choice' ? q.options.map((o) => o.trim().slice(0, 60)).filter(Boolean).slice(0, 12) : [] });
    if (out.length >= MAX_CLOSING_QUESTIONS) break;
  }
  return out;
}

export function moveItem<V>(list: V[], from: number, to: number): V[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Leads the caller's number matched (offered when linking a follow-up to a lead). */
export const leadCandidates = (call: { match?: { candidates?: Array<{ id: string; name: string | null; number: string | null }> } }) => (call.match?.candidates ?? []).map((c) => ({ id: c.id, name: c.name, number: c.number }));
/** A lead can be created only when the caller's number is known. */
export const canCreateLeadFor = (call: { caller: { number: string | null; presentation?: string } }) => Boolean(call.caller.number) && call.caller.presentation !== 'private' && call.caller.presentation !== 'unavailable';

/**
 * The agent PATCH `inbound` object: only keys the API accepts, closing questions cleaned
 * (empty rows dropped), and only the status overrides that differ from the defaults.
 */
export function inboundPayload(inbound: {
  greeting?: string; instructions?: string; escalationInstructions?: string; assignToUserId?: string | null; assignOverridesLeadOwner?: boolean;
  statusByResult?: Record<string, string>; closingQuestions?: Array<{ key: string; label: string; question: string; type: string; required: boolean; options?: string[] }>;
}) {
  const out: Record<string, unknown> = {};
  for (const k of ['greeting', 'instructions', 'escalationInstructions'] as const) if (inbound[k] != null) out[k] = inbound[k];
  if (inbound.assignToUserId !== undefined) out.assignToUserId = inbound.assignToUserId || null;
  if (inbound.assignOverridesLeadOwner !== undefined) out.assignOverridesLeadOwner = Boolean(inbound.assignOverridesLeadOwner);
  if (inbound.statusByResult) out.statusByResult = statusByResultPatch(Object.fromEntries(Object.entries(inbound.statusByResult).filter(([k]) => (ROUTING_RESULT_KEYS as readonly string[]).includes(k))), DEFAULT_STATUS_BY_RESULT);
  if (inbound.closingQuestions) out.closingQuestions = closingQuestionsPayload(inbound.closingQuestions.map((q) => ({ ...q, type: q.type as ClosingQuestion['type'], options: q.options ?? [] })));
  return out;
}
