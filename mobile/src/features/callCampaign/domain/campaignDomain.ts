// Pure rules for SIM call campaigns (unit-tested). Nothing here touches the network,
// storage or native modules.
import type { CallStateEvent } from '@/services/telephony/types';

import type {
  CallOutcome,
  CampaignQuestion,
  CampaignStatus,
  ClaimReason,
  OutcomeEvidence,
  TaskAnswer,
} from '../types';

export type CampaignAction = 'start' | 'resume' | 'pause' | 'cancel' | 'retry';

/** Actions the server will accept for a campaign status (mirrors simCall CAMPAIGN_TRANSITIONS). */
export function campaignActions(status: CampaignStatus): CampaignAction[] {
  switch (status) {
    case 'draft':
      return ['start', 'cancel'];
    case 'running':
      return ['pause', 'cancel', 'retry'];
    case 'paused':
      return ['resume', 'cancel', 'retry'];
    case 'completed':
      return ['retry'];
    default:
      return [];
  }
}

/** Outcomes that need a placed call (the server refuses them for an undialled lead). */
export const OUTCOMES_AFTER_DIAL: readonly CallOutcome[] = [
  'answered',
  'no_answer',
  'busy',
  'rejected',
  'callback_requested',
  'wrong_number',
];
export const OUTCOMES_WITHOUT_DIAL: readonly CallOutcome[] = ['failed', 'cancelled'];

type LocalAnswers = Record<
  string,
  { status: TaskAnswer['status']; value?: unknown; normalizedValue?: unknown }
>;

/** Best local guess of the normalised value (the server's validation is authoritative). */
function localValue(question: CampaignQuestion | undefined, entry: LocalAnswers[string]): unknown {
  if (entry.normalizedValue !== undefined && entry.normalizedValue !== null) return entry.normalizedValue;
  if (question?.type === 'boolean' && typeof entry.value === 'string') {
    if (/^(y|yes|true|ja|oui|si|haan|han)$/i.test(entry.value.trim())) return true;
    if (/^(n|no|false|nein|non|nahi)$/i.test(entry.value.trim())) return false;
  }
  if (question?.type === 'integer' || question?.type === 'currency' || question?.type === 'decimal') {
    const n = Number(String(entry.value).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : entry.value;
  }
  return entry.value;
}

type Clause = { field: string; [op: string]: unknown };

function clauseMatches(clause: Clause, values: Record<string, unknown>): boolean {
  const value = values[clause.field];
  if ('exists' in clause) return clause.exists ? value !== undefined : value === undefined;
  if (value === undefined) return false;
  if ('contains' in clause)
    return Array.isArray(value)
      ? value.includes(clause.contains)
      : typeof value === 'string' && typeof clause.contains === 'string' && value.includes(clause.contains);
  if ('equals' in clause) return value === clause.equals;
  if ('notEquals' in clause) return value !== clause.notEquals;
  if ('in' in clause) return Array.isArray(clause.in) && clause.in.includes(value);
  if ('gt' in clause) return Number(value) > Number(clause.gt);
  if ('gte' in clause) return Number(value) >= Number(clause.gte);
  if ('lt' in clause) return Number(value) < Number(clause.lt);
  if ('lte' in clause) return Number(value) <= Number(clause.lte);
  return false;
}

/** Ordered questions whose skip rules pass for the current answers (same rules as the server). */
export function visibleQuestions(
  questions: readonly CampaignQuestion[],
  answers: LocalAnswers,
): CampaignQuestion[] {
  const byKey = new Map(questions.map((q) => [q.fieldKey, q]));
  const values: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(answers)) {
    if (entry.status === 'answered') values[key] = localValue(byKey.get(key), entry);
  }
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .filter((q) => {
      const c = q.condition as { all?: Clause[]; any?: Clause[] } | null | undefined;
      if (!c || (!c.all && !c.any)) return true;
      const all = (c.all ?? []).every((cl) => clauseMatches(cl, values));
      const any = c.any ? c.any.some((cl) => clauseMatches(cl, values)) : true;
      return all && any;
    });
}

/** Offset of `timeZone` from UTC (ms) at the given instant. Throws on an invalid zone. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant of a wall-clock date + time in an explicit timezone ("tomorrow 10:00" in the
 * lead's zone). Never guesses: the caller picks the date, time and zone. Returns null for
 * malformed input.
 */
export function zonedWallTimeToIso(date: string, time: string, timeZone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  try {
    // Test offsets on both sides of a transition. Zero matches means invalid date / DST
    // gap; two matches means ambiguous repeated time. Neither may be silently moved.
    const offsets = new Set([-36, 0, 36].map((h) => zoneOffsetMs(guess + h * 3600_000, timeZone)));
    const matches = [...offsets]
      .map((offset) => guess - offset)
      .filter((instant) => {
        const wall = new Date(instant + zoneOffsetMs(instant, timeZone)).toISOString();
        return wall.slice(0, 16) === `${date}T${time}`;
      });
    return matches.length === 1 ? new Date(matches[0]!).toISOString() : null;
  } catch {
    return null;
  }
}

export function missingRequiredQuestions(
  questions: readonly CampaignQuestion[],
  answers: LocalAnswers,
): string[] {
  return visibleQuestions(questions, answers)
    .filter((q) => q.required && !['answered', 'unknown'].includes(answers[q.fieldKey]?.status ?? ''))
    .map((q) => q.fieldKey);
}

/** YYYY-MM-DD of an instant in a timezone (for date pickers and display). */
export function ymdInZone(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/**
 * Whether the campaign's calling window is open at `now` in its timezone (same rule as the server
 * gate: days of week + [start, end), overnight windows allowed). Used only to warn; the server decides.
 */
export function callWindowOpen(
  window: { start: string; end: string },
  days: readonly number[],
  timeZone: string,
  now: Date = new Date(),
): boolean {
  const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return false;
  }
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const start = toMin(window.start);
  const end = toMin(window.end);
  const inWindow = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return days.includes(WEEKDAY[value('weekday')] ?? -1) && inWindow;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export type CallEvidence = {
  offhookAt: number | null;
  endedAt: number | null;
  offhookDurationSec: number | null;
  /** True once the phone went off-hook and back to idle: the call is over. */
  ended: boolean;
};

/**
 * What the telephony callbacks show for one attempt. Off-hook starts at DIALLING on
 * Android, so this proves the call happened and ended — never that it was answered.
 */
export function callEvidence(events: readonly CallStateEvent[], sinceMs = 0): CallEvidence {
  const ordered = events.filter((e) => e.at >= sinceMs).sort((a, b) => a.at - b.at);
  const offhook = ordered.find((e) => e.state === 'offhook') ?? null;
  const idle = offhook ? (ordered.find((e) => e.state === 'idle' && e.at >= offhook.at) ?? null) : null;
  return {
    offhookAt: offhook?.at ?? null,
    endedAt: idle?.at ?? null,
    offhookDurationSec: offhook && idle ? Math.max(0, Math.round((idle.at - offhook.at) / 1000)) : null,
    ended: Boolean(offhook && idle),
  };
}

export type CallLogHint = { found: boolean; durationSec: number | null };

/**
 * A suggestion only — the user always confirms. With a call-log entry a talk time > 0 means
 * the call connected; 0 means it did not (no answer, busy or rejected: Android does not say
 * which). Without a call log there is no suggestion.
 */
export function suggestOutcome(callLog: CallLogHint | null): {
  outcome: CallOutcome | null;
  evidence: OutcomeEvidence;
} {
  if (callLog?.found && callLog.durationSec !== null) {
    return { outcome: callLog.durationSec > 0 ? 'answered' : null, evidence: 'call_log' };
  }
  return { outcome: null, evidence: 'user' };
}

export type AdvanceBlocker =
  | 'campaign_not_running'
  | 'offline'
  | 'result_not_synced'
  | 'call_not_ended'
  | 'outcome_missing'
  | 'user_paused';

/** Why the app must NOT move to (or auto-dial) the next lead right now; null = allowed. */
export function advanceBlocker(input: {
  campaignStatus: CampaignStatus | null;
  online: boolean;
  resultSynced: boolean;
  callEnded: boolean;
  outcomeRecorded: boolean;
  userPaused: boolean;
}): AdvanceBlocker | null {
  if (input.userPaused) return 'user_paused';
  if (input.campaignStatus !== 'running') return 'campaign_not_running';
  if (!input.callEnded) return 'call_not_ended';
  if (!input.outcomeRecorded) return 'outcome_missing';
  if (!input.online) return 'offline';
  if (!input.resultSynced) return 'result_not_synced';
  return null;
}

export const COUNTDOWN_MIN = 3;
export const COUNTDOWN_MAX = 120;
export const clampCountdown = (seconds: number) =>
  Math.min(COUNTDOWN_MAX, Math.max(COUNTDOWN_MIN, Math.round(seconds || 10)));

/** Whether a claim result means "come back later" vs "nothing left". */
export function isWaitingReason(reason: ClaimReason | null): boolean {
  return reason === 'waiting' || reason === 'outside_calling_hours' || reason === 'not_started';
}

/** Progress for the list/detail screens: closed = no further call will be made. */
export function campaignProgress(summary: {
  total: number;
  completed: number;
  skipped: number;
  ineligible: number;
  cancelled: number;
}) {
  const closed = summary.completed + summary.skipped + summary.ineligible + summary.cancelled;
  return {
    closed,
    remaining: Math.max(0, summary.total - closed),
    ratio: summary.total ? closed / summary.total : 0,
  };
}
