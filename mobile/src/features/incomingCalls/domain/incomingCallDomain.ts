// Pure display and permission rules for incoming calls. They mirror the server's state machine
// (server/src/modules/inboundCalling/engine/stateMachine.js) and InboundCallService.control(),
// so a button is only offered when the server would accept it.
import type { BadgeVariant } from '@/components/ui/AppBadge';

import type { ControlKind, TranscriptTurn } from '../types';

export const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'MISSED',
  'REJECTED',
  'FAILED',
  'INTERRUPTED',
  'CANCELLED',
]);
export const RINGING_STATUSES = new Set([
  'DETECTED',
  'RECEIVED',
  'IDENTIFYING',
  'QUEUED',
  'RINGING',
  'ANSWERING',
]);
const TAKEOVER_STATUSES = new Set(['AI_ACTIVE', 'CONNECTING_AUDIO', 'ANSWERED', 'TRANSFERRING']);

export const isTerminal = (status: string) => TERMINAL_STATUSES.has(status);
export const isRinging = (status: string) => RINGING_STATUSES.has(status);
/** Still on the line or ringing (WRAPPING_UP = the line is down, processing runs). */
export const isLive = (status: string) => !isTerminal(status) && status !== 'WRAPPING_UP';

/** Only these AI states may ever be presented as "AI connected". */
export const AI_CONNECTED_STATES = new Set(['connected', 'listening', 'speaking']);
export const isAiConnected = (aiStatus: string) => AI_CONNECTED_STATES.has(aiStatus);

export type AiStatusKey =
  | 'waiting'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'callerSpeaking'
  | 'humanHandling'
  | 'unavailable'
  | 'completed'
  | 'failed'
  | 'notUsed';

/**
 * Map the server's AI session status (+ who is talking) to one label key. "Caller speaking"
 * is only derived while the AI is actually connected, so a stale speaker never relabels an
 * ended or failed session.
 */
export function aiStatusKey(aiStatus: string, speaker?: string | null): AiStatusKey {
  switch (aiStatus) {
    case 'waiting':
      return 'waiting';
    case 'connecting':
      return 'connecting';
    case 'speaking':
      return 'speaking';
    case 'connected':
    case 'listening':
      return speaker === 'caller' ? 'callerSpeaking' : 'listening';
    case 'handed_off':
      return 'humanHandling';
    case 'unavailable':
      return 'unavailable';
    case 'ended':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'notUsed';
  }
}

export const AI_STATUS_VARIANT: Record<AiStatusKey, BadgeVariant> = {
  waiting: 'muted',
  connecting: 'info',
  listening: 'success',
  speaking: 'success',
  callerSpeaking: 'success',
  humanHandling: 'primary',
  unavailable: 'warning',
  completed: 'muted',
  failed: 'destructive',
  notUsed: 'muted',
};

export function statusVariant(status: string): BadgeVariant {
  if (isRinging(status)) return 'warning';
  if (status === 'AI_ACTIVE' || status === 'HUMAN_ACTIVE') return 'success';
  if (status === 'COMPLETED') return 'muted';
  if (['MISSED', 'FAILED', 'INTERRUPTED'].includes(status)) return 'destructive';
  if (isTerminal(status)) return 'muted';
  return 'info';
}

export function audioVariant(audioStatus: string): BadgeVariant {
  if (audioStatus === 'connected') return 'success';
  if (audioStatus === 'lost') return 'destructive';
  if (audioStatus === 'reconnecting' || audioStatus === 'connecting') return 'warning';
  return 'muted';
}

/**
 * Owner controls the server would accept right now (InboundCallService.control):
 * answer = hand a ringing call to the AI; reject = decline while ringing;
 * takeover = move the audio to the phone's handset; hangup = end an answered call.
 * A command already sent and not yet acknowledged by the phone is not offered again.
 */
export function availableControls(call: {
  status: string;
  handling: string | null;
  pendingCommand?: string | null;
}): ControlKind[] {
  if (!isLive(call.status)) return [];
  const out: ControlKind[] = [];
  if (isRinging(call.status)) {
    if (call.handling !== 'ai' && call.status !== 'ANSWERING') out.push('answer');
    out.push('reject');
  } else {
    if (TAKEOVER_STATUSES.has(call.status)) out.push('takeover');
    out.push('hangup');
  }
  return out.filter((kind) => kind !== call.pendingCommand);
}

export function simLabel(sim: { slot: number | null; label: string | null }): string | null {
  if (sim.label) return sim.label;
  return sim.slot != null ? `SIM ${sim.slot + 1}` : null;
}

export type CallerTypeKey = 'new' | 'existing' | 'ambiguous' | 'private' | 'unknown';
export function callerTypeKey(callerType: string | null): CallerTypeKey {
  return callerType === 'new' ||
    callerType === 'existing' ||
    callerType === 'ambiguous' ||
    callerType === 'private'
    ? callerType
    : 'unknown';
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Local midnight as ISO: the "today" window for stats. */
export function startOfTodayIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Append a realtime transcript turn once, even if several listeners deliver it. */
export function appendTurn<T extends Pick<TranscriptTurn, 'itemId' | 'role' | 'text' | 'at'>>(
  turns: T[],
  turn: T,
  keep?: number,
): T[] {
  const seen = turns.some((t) =>
    turn.itemId && t.itemId
      ? t.itemId === turn.itemId
      : t.role === turn.role && t.text === turn.text && t.at === turn.at,
  );
  if (seen) return turns;
  const next = [...turns, turn];
  return keep ? next.slice(-keep) : next;
}

/**
 * The call rang while the phone was already in another call (call waiting). The server marks it
 * with `handling.aiBlockedBy: 'call_waiting'` (presentRow's `aiBlockedBy`); `callWaiting` is also
 * accepted. It stays true after the other call ends: it describes how this call arrived.
 */
export function rangDuringOtherCall(call: { aiBlockedBy?: string | null; callWaiting?: boolean }): boolean {
  return call.callWaiting === true || call.aiBlockedBy === 'call_waiting';
}

/** Money with enough decimals for per-call AI costs (fractions of a cent). */
export function formatCost(amount: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(4)} ${currency}`;
  }
}
