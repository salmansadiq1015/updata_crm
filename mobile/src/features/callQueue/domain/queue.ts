// SIM call queue ("power dialer" without the auto-dial): the user calls a chosen list of
// leads one after another from their own SIM. Pure state transitions; unit-tested.
//
// Rules:
//   - At most one item is `current`. Moving the pointer never dials: every call still
//     needs the user's tap on "Call" here and "Start call" on the call screen.
//   - An item's result comes only from its communication operation (the outbox), never
//     from a guess: an outcome the user submitted → `done`; a dial that failed → `failed`.
//   - Resume after a restart keeps a `current` item whose call is still open (in progress
//     or uncertain) as `current` with "record the outcome" as the next step — not "call".
import type { LocalOperation } from '@/features/communication/domain/operations';
import type { Disposition } from '@/features/communication/types';

export const QUEUE_ITEM_STATES = ['pending', 'current', 'done', 'skipped', 'failed'] as const;
export type QueueItemState = (typeof QUEUE_ITEM_STATES)[number];

/** Why an item was skipped: the user, the queue being ended, or a CRM eligibility reason code. */
export type SkipReason = 'user' | 'ended' | string;

export type QueueItem = {
  leadId: string;
  leadName: string;
  state: QueueItemState;
  /** The communication operation of the call placed for this item (if any). */
  operationId?: string | null;
  /** When the user last tapped "Call" for this item (links an operation created after it). */
  callRequestedAt?: number | null;
  disposition?: Disposition | null;
  followUpAt?: string | null;
  /** Qualification answers the user confirmed in the outcome. */
  answersCount?: number;
  skipReason?: SkipReason | null;
};

export type CallQueue = {
  version: 1;
  id: string;
  userId: string;
  createdAt: number;
  leadIds: string[];
  items: QueueItem[];
  paused: boolean;
  /** Set by "End queue": the remaining leads are left uncalled and the summary is shown. */
  endedAt: number | null;
};

/** The slice of a communication operation the queue needs. */
export type OperationView = Pick<
  LocalOperation,
  'operationId' | 'leadId' | 'channel' | 'phase' | 'createdAt' | 'completePayload'
>;

export function createQueue(input: {
  id: string;
  userId: string;
  leads: readonly { id: string; name: string }[];
  now: number;
}): CallQueue {
  const seen = new Set<string>();
  const items: QueueItem[] = [];
  for (const lead of input.leads) {
    if (!lead.id || seen.has(lead.id)) continue;
    seen.add(lead.id);
    items.push({ leadId: lead.id, leadName: lead.name, state: 'pending' });
  }
  return advance({
    version: 1,
    id: input.id,
    userId: input.userId,
    createdAt: input.now,
    leadIds: items.map((item) => item.leadId),
    items,
    paused: false,
    endedAt: null,
  });
}

export function currentItem(queue: CallQueue): QueueItem | null {
  return queue.items.find((item) => item.state === 'current') ?? null;
}

export function pendingItems(queue: CallQueue): QueueItem[] {
  return queue.items.filter((item) => item.state === 'pending');
}

/** Moves the pointer to the next pending item when nothing is current. Never dials. */
export function advance(queue: CallQueue): CallQueue {
  if (queue.endedAt || currentItem(queue)) return queue;
  const index = queue.items.findIndex((item) => item.state === 'pending');
  if (index < 0) return queue;
  return withItem(queue, index, { state: 'current' });
}

function withItem(queue: CallQueue, index: number, change: Partial<QueueItem>): CallQueue {
  const items = queue.items.map((item, i) => (i === index ? { ...item, ...change } : item));
  return { ...queue, items };
}

function indexOf(queue: CallQueue, leadId: string): number {
  return queue.items.findIndex((item) => item.leadId === leadId);
}

/** True while the item's call still needs the user (outcome not submitted yet). */
export function hasOpenCall(item: QueueItem, operations: Record<string, OperationView>): boolean {
  const op = item.operationId ? operations[item.operationId] : undefined;
  if (!op || op.completePayload) return false;
  return op.phase !== 'abandoned' && op.phase !== 'dispatch_failed' && op.phase !== 'done';
}

/** The user tapped "Call" (the call screen still waits for "Start call"). */
export function markCallRequested(queue: CallQueue, leadId: string, now: number): CallQueue {
  const index = indexOf(queue, leadId);
  if (index < 0 || queue.items[index]!.state !== 'current') return queue;
  return withItem(queue, index, { callRequestedAt: now });
}

/** The call screen started an operation for this lead. */
export function attachOperation(queue: CallQueue, leadId: string, operationId: string): CallQueue {
  const index = indexOf(queue, leadId);
  if (index < 0 || queue.items[index]!.state !== 'current') return queue;
  return withItem(queue, index, { operationId });
}

/** Skip a pending or current item (the user, or ineligible by the CRM's check). */
export function skipItem(queue: CallQueue, leadId: string, reason: SkipReason = 'user'): CallQueue {
  const index = indexOf(queue, leadId);
  const item = queue.items[index];
  if (!item || (item.state !== 'pending' && item.state !== 'current')) return queue;
  return advance(withItem(queue, index, { state: 'skipped', skipReason: reason }));
}

export function markIneligible(queue: CallQueue, leadId: string, reasons: readonly string[]): CallQueue {
  return skipItem(queue, leadId, reasons.length > 0 ? reasons.join(',') : 'NO_DESTINATION');
}

export function setPaused(queue: CallQueue, paused: boolean): CallQueue {
  return paused === queue.paused ? queue : { ...queue, paused };
}

export function endQueue(queue: CallQueue, now: number): CallQueue {
  return queue.endedAt ? queue : { ...queue, endedAt: now, paused: false };
}

function answeredCount(op: OperationView): number {
  return (op.completePayload?.qualification?.answers ?? []).filter((answer) => answer.status === 'answered')
    .length;
}

/**
 * Bring the current item in line with the outbox. Called whenever operations change and at
 * launch (only after the user's outbox has loaded). Pure: dialing is never a result.
 */
export function reconcile(queue: CallQueue, operations: Record<string, OperationView>): CallQueue {
  const index = queue.items.findIndex((item) => item.state === 'current');
  if (index < 0) return advance(queue);
  let item = queue.items[index]!;

  // Link a call started from the queue whose id was not attached (e.g. the app stopped).
  if (!item.operationId && item.callRequestedAt) {
    const since = item.callRequestedAt;
    const match = Object.values(operations)
      .filter(
        (op) =>
          op.leadId === item.leadId &&
          op.channel === 'phone' &&
          op.createdAt >= since &&
          op.phase !== 'abandoned',
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (match) item = { ...item, operationId: match.operationId };
  }

  const op = item.operationId ? operations[item.operationId] : undefined;
  if (item.operationId && !op) {
    // Removed from the device (dismissed after nothing was placed): the lead can be called.
    item = { ...item, operationId: null, callRequestedAt: null };
  } else if (op?.completePayload) {
    item = {
      ...item,
      state: 'done',
      disposition: op.completePayload.outcome.disposition,
      followUpAt: op.completePayload.outcome.followUpAt ?? null,
      answersCount: answeredCount(op),
    };
  } else if (op?.phase === 'dispatch_failed') {
    item = { ...item, state: 'failed' };
  } else if (op?.phase === 'abandoned') {
    item = { ...item, operationId: null, callRequestedAt: null };
  }
  // preparing / dispatching / in_progress / dispatch_unknown: the call is open, stays current.

  const unchanged = item === queue.items[index];
  const next = unchanged ? queue : withItem(queue, index, item);
  return advance(next);
}

export type QueueStep =
  | { kind: 'empty' }
  | { kind: 'finished' }
  | { kind: 'paused'; item: QueueItem | null }
  /** The current call is open: the next step is recording its outcome (never redial). */
  | { kind: 'record_outcome'; item: QueueItem; operationId: string }
  /** Ready for the user to tap "Call". */
  | { kind: 'call'; item: QueueItem };

export function nextStep(queue: CallQueue | null, operations: Record<string, OperationView>): QueueStep {
  if (!queue || queue.items.length === 0) return { kind: 'empty' };
  if (isFinished(queue)) return { kind: 'finished' };
  const item = currentItem(queue);
  if (item && item.operationId && hasOpenCall(item, operations)) {
    return { kind: 'record_outcome', item, operationId: item.operationId };
  }
  if (queue.paused) return { kind: 'paused', item };
  return item ? { kind: 'call', item } : { kind: 'finished' };
}

export function isFinished(queue: CallQueue): boolean {
  if (queue.endedAt) return true;
  return queue.items.every((item) => item.state !== 'pending' && item.state !== 'current');
}

export type QueueProgress = {
  total: number;
  done: number;
  skipped: number;
  failed: number;
  /** done + skipped + failed */
  finished: number;
  remaining: number;
  /** 1-based position of the current item ("3 of 10"); `finished` when none is current. */
  position: number;
};

export function progress(queue: CallQueue): QueueProgress {
  const count = (state: QueueItemState) => queue.items.filter((item) => item.state === state).length;
  const done = count('done');
  const skipped = count('skipped');
  const failed = count('failed');
  const finished = done + skipped + failed;
  const currentIndex = queue.items.findIndex((item) => item.state === 'current');
  return {
    total: queue.items.length,
    done,
    skipped,
    failed,
    finished,
    remaining: queue.items.length - finished,
    position: currentIndex >= 0 ? currentIndex + 1 : finished,
  };
}

export type QueueSummary = {
  total: number;
  called: number;
  skipped: number;
  failed: number;
  notCalled: number;
  byDisposition: { disposition: Disposition; count: number }[];
  callbacks: number;
  answers: number;
};

export function summarize(queue: CallQueue): QueueSummary {
  const counts = new Map<Disposition, number>();
  let callbacks = 0;
  let answers = 0;
  for (const item of queue.items) {
    if (item.state !== 'done' || !item.disposition) continue;
    counts.set(item.disposition, (counts.get(item.disposition) ?? 0) + 1);
    if (item.followUpAt || item.disposition === 'callback_requested') callbacks += 1;
    answers += item.answersCount ?? 0;
  }
  const p = progress(queue);
  return {
    total: p.total,
    called: p.done,
    skipped: p.skipped,
    failed: p.failed,
    notCalled: p.remaining,
    byDisposition: [...counts.entries()]
      .map(([disposition, count]) => ({ disposition, count }))
      .sort((a, b) => b.count - a.count),
    callbacks,
    answers,
  };
}
