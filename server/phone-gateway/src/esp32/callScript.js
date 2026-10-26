/**
 * The scripted audio-proof call as a pure state machine. JS port of linux/updata_hfp/callscript.py
 * (same phases, outcomes and timings; both are unit-tested against the same scenarios).
 *
 *   connect → preflight (phone idle) → dial → ringing → answered → audio link →
 *   listen (remote says the test phrase) → speak (play the prompt) → after (remote repeats it) →
 *   hang up → done
 *
 * handle(event, now, data) / tick(now) return actions:
 *   ['dial', number] · ['hangup'] · ['connect_sco'] · ['play'] · ['finish', outcome, detail] · ['log', event, data]
 * It dials at most once; any doubt about the real call state ends in outcome_unknown, never a redial.
 * Times are in seconds.
 */

export const DEFAULTS = Object.freeze({
  slcTimeoutS: 20,
  dialAckTimeoutS: 10,
  ringTimeoutS: 45,
  audioWaitS: 4,
  audioFailS: 12,
  listenS: 10,
  afterS: 10,
  speakMaxS: 30,
  hangupTimeoutS: 10,
  maxCallS: 120,
  audioGraceS: 2, // phones close audio just before reporting a remote hang-up
});

const round2 = (v) => Math.round(v * 100) / 100;

export class CallScript {
  constructor(number, now, options = {}) {
    this.number = number;
    this.o = { ...DEFAULTS, ...options };
    this.phase = 'connecting';
    this.phaseAt = now;
    this.dialedAt = null;
    this.audioAt = null;
    this.audioOpen = false;
    this.scoRequested = false;
    this.audioLostAt = null;
    this.dialed = false;
    this.outcome = null;
    this.metrics = {};
  }

  go(phase, now, data = {}) {
    this.phase = phase;
    this.phaseAt = now;
    return [['log', 'script_phase', { phase, ...data }]];
  }

  finish(outcome, detail, now) {
    this.outcome = outcome;
    this.metrics.finishedAtS = this.dialedAt !== null ? round2(now - this.dialedAt) : null;
    return [...this.go('done', now, { outcome }), ['finish', outcome, detail]];
  }

  hangup(now, outcome, detail) {
    this.metrics.plannedOutcome = outcome;
    this.metrics.plannedDetail = detail;
    return [...this.go('hanging_up', now, { reason: outcome }), ['hangup']];
  }

  handle(event, now, data = {}) {
    if (this.phase === 'done') return [];
    switch (event) {
      case 'slc_connected': {
        if (this.phase !== 'connecting') return [];
        const state = data.callState || 'idle';
        if (state !== 'idle') return this.finish('phone_busy', `phone call state is ${state}; not dialing`, now);
        this.dialed = true;
        this.dialedAt = now;
        return [...this.go('dialing', now), ['dial', this.number]];
      }
      case 'slc_failed':
        return this.finish('slc_failed', data.detail, now);
      case 'dial_result':
        if (this.phase === 'dialing' && !data.ok) return this.finish('dial_rejected', data.detail, now);
        return [];
      case 'slc_lost':
        if (this.dialed) return this.finish('outcome_unknown', 'control link lost after dialing', now);
        return this.finish('slc_failed', 'control link lost before dialing', now);
      case 'audio_opened':
        this.audioOpen = true;
        this.audioLostAt = null;
        if (this.audioAt === null) {
          this.audioAt = now;
          if (this.dialedAt !== null) this.metrics.audioAfterDialS = round2(now - this.dialedAt);
        }
        return this.phase === 'waiting_audio' ? this.go('listening', now) : [];
      case 'audio_closed':
        this.audioOpen = false;
        if (['listening', 'speaking', 'after'].includes(this.phase)) {
          this.audioLostAt = now; // wait audioGraceS: a remote hang-up closes audio first
          return [['log', 'script_audio_closed', { phase: this.phase }]];
        }
        return [];
      case 'prompt_done':
        if (this.phase !== 'speaking') return [];
        this.metrics.promptS = round2(now - this.phaseAt);
        return this.go('after', now);
      case 'call_state':
        return this.callState(data.state, now);
      default:
        return [];
    }
  }

  callState(state, now) {
    const p = this.phase;
    if (p === 'dialing' && (state === 'dialing' || state === 'alerting')) return this.go('ringing', now, { state });
    if ((p === 'dialing' || p === 'ringing') && state === 'active') {
      this.metrics.setupS = round2(now - this.dialedAt);
      return this.go(this.audioOpen ? 'listening' : 'waiting_audio', now);
    }
    if (state === 'idle') {
      if (p === 'ringing') return this.finish('not_answered', 'call ended before it was answered (busy, rejected or no answer)', now);
      if (['waiting_audio', 'listening', 'speaking', 'after'].includes(p)) return this.finish('remote_hangup', `call ended during the ${p} phase`, now);
      if (p === 'hanging_up') return this.finish(this.metrics.plannedOutcome, this.metrics.plannedDetail, now);
    }
    return [];
  }

  tick(now) {
    const p = this.phase;
    const age = now - this.phaseAt;
    const o = this.o;
    if (p === 'done') return [];
    if (this.dialedAt !== null && now - this.dialedAt > o.maxCallS && p !== 'hanging_up') return this.hangup(now, 'max_duration', 'call reached maxCallS');
    if (p === 'connecting' && age > o.slcTimeoutS) return this.finish('slc_failed', `no service level connection after ${o.slcTimeoutS}s`, now);
    if (p === 'dialing' && age > o.dialAckTimeoutS) return this.hangup(now, 'dial_unconfirmed', 'phone never reported the outgoing call');
    if (p === 'ringing' && age > o.ringTimeoutS) return this.hangup(now, 'not_answered', `no answer after ${o.ringTimeoutS}s`);
    if (p === 'waiting_audio') {
      if (age > o.audioFailS) return this.hangup(now, 'audio_failed', `no audio link ${o.audioFailS}s after answer`);
      if (age > o.audioWaitS && !this.scoRequested) {
        this.scoRequested = true;
        return [['log', 'script_connect_sco', {}], ['connect_sco']];
      }
    }
    if (this.audioLostAt !== null && ['listening', 'speaking', 'after'].includes(p) && now - this.audioLostAt > o.audioGraceS) {
      const phase = p;
      this.audioLostAt = null;
      return this.hangup(now, 'audio_lost', `audio link closed during the ${phase} phase and the call stayed up`);
    }
    if (p === 'listening' && age > o.listenS) return [...this.go('speaking', now), ['play']];
    if (p === 'speaking' && age > o.speakMaxS) return this.go('after', now, { note: 'prompt still playing at speakMaxS' });
    if (p === 'after' && age > o.afterS) return this.hangup(now, 'completed', 'script finished; verify both directions from the evidence');
    if (p === 'hanging_up' && age > o.hangupTimeoutS) return this.finish('outcome_unknown', 'phone did not confirm the hang-up', now);
    return [];
  }
}

/** Phone call state from the HFP indicators, same rule as the firmware and the Linux probe. */
export function callStateOf({ call, callsetup }) {
  if (call === 1) return 'active';
  return { 1: 'incoming', 2: 'dialing', 3: 'alerting' }[callsetup] || 'idle';
}
