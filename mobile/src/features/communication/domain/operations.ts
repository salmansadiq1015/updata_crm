// Local lifecycle of one contact attempt (a SIM call or an SMS composer hand-off).
// Two kinds of work are kept strictly apart:
//   - the communication side effect (dial / open composer): happens at most once, only
//     after the CRM authorised the attempt, and is NEVER replayed by recovery;
//   - CRM synchronisation (events, outcome): idempotent on the server, so it is retried.

import type { CallStateEvent } from '@/services/telephony/types';
import { ApiError } from '@/services/api/apiErrors';

import type {
  Channel,
  CommunicationEvent,
  CommunicationEventType,
  CommunicationRoute,
  CompletePayload,
  DestinationField,
  Receipt,
} from '../types';
import { receiptStatus } from '../types';

export type LocalPhase =
  /** Waiting for the CRM to authorise the attempt (POST /communications). Nothing dialed. */
  | 'preparing'
  /** Authorised; the native dispatch was requested. Persisted BEFORE calling native. */
  | 'dispatching'
  /** Call placed / dialer or composer opened. Waiting for the user's outcome. */
  | 'in_progress'
  | 'dispatch_failed'
  /** The app stopped while dispatching: a call may or may not have been placed. */
  | 'dispatch_unknown'
  /** Outcome recorded on the device; syncing to the CRM. */
  | 'submitting'
  /** Sync paused (conflict, permission, validation) or the CRM reported a failed step. */
  | 'needs_attention'
  | 'done'
  /** Closed without contact (CRM refused, or the user cancelled before dispatch). */
  | 'abandoned';

export type SyncError = { kind: SyncErrorKind; code: string | null; status: number | null };
export type SyncErrorKind = 'transient' | 'conflict' | 'forbidden' | 'not_found' | 'invalid' | 'session';

export type OutcomeDraft = {
  disposition: string | null;
  connected: 'yes' | 'no' | 'unknown';
  notes: string;
  followUpAt: string | null;
  statusChange: string | null;
  doNotContact: boolean;
  smsSendStatus: string | null;
  answers: Record<string, { value: string; status: string; source: string; evidence: string | null }>;
};

export type LocalOperation = {
  operationId: string;
  userId: string;
  leadId: string;
  leadName: string;
  channel: Channel;
  destinationField: DestinationField;
  route: CommunicationRoute | null;
  sim: { subscriptionId: number; slotIndex: number; label: string } | null;
  /** The CRM accepted POST /communications for this operation. */
  serverConfirmed: boolean;
  phase: LocalPhase;
  createdAt: number;
  dispatchedAt: number | null;
  nextSeq: number;
  pendingEvents: CommunicationEvent[];
  callEvents: Pick<CallStateEvent, 'state' | 'at'>[];
  draft: OutcomeDraft;
  /** SMS only: the exact text handed to the composer. */
  smsBody: string | null;
  smsTemplateId: string | null;
  completePayload: CompletePayload | null;
  receipt: Receipt | null;
  sync: { attempts: number; nextAttemptAt: number; lastError: SyncError | null; paused: boolean };
  dispatchError: string | null;
};

export const EMPTY_DRAFT: OutcomeDraft = {
  disposition: null,
  connected: 'unknown',
  notes: '',
  followUpAt: null,
  statusChange: null,
  doNotContact: false,
  smsSendStatus: null,
  answers: {},
};

export function newOperation(input: {
  operationId: string;
  userId: string;
  leadId: string;
  leadName: string;
  channel: Channel;
  destinationField: DestinationField;
  sim: LocalOperation['sim'];
  now: number;
}): LocalOperation {
  return {
    ...input,
    route: null,
    serverConfirmed: false,
    phase: 'preparing',
    createdAt: input.now,
    dispatchedAt: null,
    nextSeq: 1, // seq 0 is the server's own `created` event
    pendingEvents: [],
    callEvents: [],
    draft: EMPTY_DRAFT,
    smsBody: null,
    smsTemplateId: null,
    completePayload: null,
    receipt: null,
    sync: { attempts: 0, nextAttemptAt: 0, lastError: null, paused: false },
    dispatchError: null,
  };
}

export function withEvent(
  op: LocalOperation,
  type: CommunicationEventType,
  source: CommunicationEvent['source'],
  at: number,
  data?: CommunicationEvent['data'],
): LocalOperation {
  const event: CommunicationEvent = {
    seq: op.nextSeq,
    type,
    at: new Date(at).toISOString(),
    source,
    ...(data ? { data } : {}),
  };
  return { ...op, nextSeq: op.nextSeq + 1, pendingEvents: [...op.pendingEvents, event] };
}

/** Native call-state events, de-duplicated (live listener + persisted copy overlap). */
export function withCallEvents(op: LocalOperation, events: readonly CallStateEvent[]): LocalOperation {
  const seen = new Set(op.callEvents.map((event) => `${event.state}@${event.at}`));
  let next = op;
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.operationId !== op.operationId) continue;
    const key = `${event.state}@${event.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next = withEvent(
      { ...next, callEvents: [...next.callEvents, { state: event.state, at: event.at }] },
      `call_state_${event.state}`,
      'native',
      event.at,
      { source: event.source },
    );
  }
  return next;
}

/**
 * Applied to every persisted operation at launch. Recovery reconstructs state; it never
 * re-dials or re-opens a composer.
 */
export function recoverOnLaunch(op: LocalOperation): LocalOperation {
  switch (op.phase) {
    case 'preparing':
      // Nothing was dialed (dispatch only follows a confirmed create).
      return { ...op, phase: 'abandoned' };
    case 'dispatching':
      return { ...op, phase: 'dispatch_unknown' };
    default:
      return op;
  }
}

export function classifySyncError(error: unknown): SyncError {
  const apiError = error instanceof ApiError ? error : null;
  const status = apiError?.status ?? null;
  const code = apiError?.code ?? null;
  if (!apiError || apiError.isRetryable || apiError.kind === 'invalid_response') {
    return { kind: 'transient', code, status };
  }
  if (status === 401) return { kind: 'session', code, status };
  if (status === 403) return { kind: 'forbidden', code, status };
  if (status === 404) return { kind: 'not_found', code, status };
  // The CRM is finishing an overlapping completion of the same operation (60 s lease):
  // retrying is safe and will return the stored result.
  if (status === 409 && code === 'COMPLETION_IN_PROGRESS') return { kind: 'transient', code, status };
  if (status === 409) return { kind: 'conflict', code, status };
  return { kind: 'invalid', code, status };
}

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Exponential backoff with full jitter in [delay/2, delay]. */
export function nextRetryDelay(attempts: number, random: () => number = Math.random): number {
  const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(delay / 2 + (delay / 2) * random());
}

export function afterSyncFailure(
  op: LocalOperation,
  error: SyncError,
  now: number,
  random?: () => number,
): LocalOperation {
  const attempts = op.sync.attempts + 1;
  if (error.kind === 'transient' || error.kind === 'session') {
    return {
      ...op,
      sync: {
        attempts,
        nextAttemptAt: now + nextRetryDelay(attempts, random),
        lastError: error,
        paused: false,
      },
    };
  }
  // Retrying an unauthorised, invalid or conflicting write cannot succeed: stop and ask.
  return {
    ...op,
    phase: op.phase === 'submitting' ? 'needs_attention' : op.phase,
    sync: { attempts, nextAttemptAt: Number.MAX_SAFE_INTEGER, lastError: error, paused: true },
  };
}

export function afterReceipt(op: LocalOperation, receipt: Receipt): LocalOperation {
  const status = receiptStatus(receipt);
  return {
    ...op,
    receipt,
    phase: status === 'complete' ? 'done' : 'needs_attention',
    sync: { attempts: 0, nextAttemptAt: 0, lastError: null, paused: false },
  };
}

export function needsSync(op: LocalOperation, now: number): boolean {
  if (!op.serverConfirmed || op.sync.paused || op.sync.nextAttemptAt > now) return false;
  return op.pendingEvents.length > 0 || op.phase === 'submitting';
}

/** Operations still holding work the CRM has not confirmed. */
export function hasUnsyncedWork(op: LocalOperation): boolean {
  if (op.phase === 'abandoned') return false;
  if (op.phase === 'done') return op.pendingEvents.length > 0;
  return true;
}
