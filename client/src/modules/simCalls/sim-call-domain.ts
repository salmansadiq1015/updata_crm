// Pure helpers shared by the web views (same rules as the mobile app and the server).
import type { CampaignStatus, CallOutcome, SimCallSummary, TaskState } from './types/sim-call-types';

export type CampaignAction = 'start' | 'resume' | 'pause' | 'cancel' | 'retry';

/** Actions the server accepts per campaign status (simCall CAMPAIGN_TRANSITIONS). */
export function campaignActions(status: CampaignStatus): CampaignAction[] {
  switch (status) {
    case 'draft': return ['start', 'cancel'];
    case 'running': return ['pause', 'cancel', 'retry'];
    case 'paused': return ['resume', 'cancel', 'retry'];
    case 'completed': return ['retry'];
    default: return [];
  }
}

export function progress(s: Pick<SimCallSummary, 'total' | 'completed' | 'skipped' | 'ineligible' | 'cancelled'>) {
  const closed = s.completed + s.skipped + s.ineligible + s.cancelled;
  return { closed, remaining: Math.max(0, s.total - closed), percent: s.total ? Math.round((closed / s.total) * 100) : 0 };
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft', running: 'Running', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled',
};
export const TASK_LABEL: Record<TaskState, string> = {
  pending: 'To call', in_progress: 'Calling', scheduled: 'Callback', needs_review: 'Needs review',
  completed: 'Done', skipped: 'Skipped', ineligible: 'Cannot call', cancelled: 'Cancelled',
};
export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  answered: 'Answered', no_answer: 'No answer', busy: 'Busy', rejected: 'Refused', callback_requested: 'Callback requested',
  wrong_number: 'Wrong number', failed: 'Call failed', cancelled: 'Not called',
};

/** "2026-10-21T10:00" (datetime-local) in a timezone → ISO instant; null if malformed/invalid zone. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const offset = (instant: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instant)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(instant / 1000) * 1000;
  };
  try {
    const offsets = new Set([-36, 0, 36].map((h) => offset(guess + h * 3600_000)));
    const matches = [...offsets].map((o) => guess - o).filter((t) =>
      new Date(t + offset(t)).toISOString().slice(0, 16) === local);
    return matches.length === 1 ? new Date(matches[0]!).toISOString() : null;
  } catch {
    return null;
  }
}

/** Unique, server-valid fieldKey from a label. */
export function fieldKeyFrom(label: string, taken: Set<string>): string {
  const base = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'question';
  let key = base; let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  return key;
}
