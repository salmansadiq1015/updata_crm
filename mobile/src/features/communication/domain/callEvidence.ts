// What the device actually observed about a SIM call, derived from native
// call-state events. Android's states are coarse:
//   OFFHOOK = a call exists (dialing, ringing out, active OR held) — NOT "answered";
//   RINGING = an INCOMING call is ringing (never our outgoing call);
//   IDLE    = no call.
// So the most we can claim is "a call was off-hook for N seconds". Whether the lead
// answered is user-reported. Events from before the dispatch are ignored, because the
// listener also reports the state current at registration time.

import type { CallStateEvent } from '@/services/telephony/types';

export type ObservedCallPhase = 'not_observed' | 'waiting' | 'off_hook' | 'ended';

export type CallObservation = {
  phase: ObservedCallPhase;
  offhookAt: number | null;
  endedAt: number | null;
  /** Off-hook time (dialing + ringing + talk + hold). Never "talk time". */
  offhookMs: number | null;
  /** An incoming call rang during the operation: state attribution is unreliable. */
  incomingInterference: boolean;
};

export function observeCall(
  events: readonly Pick<CallStateEvent, 'state' | 'at'>[],
  dispatchedAt: number | null,
  now: number = Date.now(),
): CallObservation {
  const empty: CallObservation = {
    phase: dispatchedAt === null ? 'not_observed' : 'waiting',
    offhookAt: null,
    endedAt: null,
    offhookMs: null,
    incomingInterference: false,
  };
  if (dispatchedAt === null) return empty;

  // Tolerate small clock skew between the dispatch timestamp and the callback.
  const relevant = events
    .filter((event) => event.at >= dispatchedAt - 1000)
    .slice()
    .sort((a, b) => a.at - b.at);

  let offhookAt: number | null = null;
  let endedAt: number | null = null;
  let incomingInterference = false;
  for (const event of relevant) {
    if (event.state === 'ringing') incomingInterference = true;
    if (event.state === 'offhook' && offhookAt === null) offhookAt = event.at;
    if (event.state === 'idle' && offhookAt !== null && endedAt === null) endedAt = event.at;
  }

  if (offhookAt === null) return { ...empty, incomingInterference };
  return {
    phase: endedAt === null ? 'off_hook' : 'ended',
    offhookAt,
    endedAt,
    offhookMs: (endedAt ?? now) - offhookAt,
    incomingInterference,
  };
}

/** `m:ss` / `h:mm:ss` for elapsed timers. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
