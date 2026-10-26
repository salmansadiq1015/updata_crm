/**
 * Paired-phone gateway: connection lifecycle for ONE phone, independent of the platform.
 *
 * A platform adapter (the macOS IOBluetooth helper today, a BlueZ helper later) does the radio
 * work and reports what happened through `handle(event)`. This module owns the state, the
 * bounded reconnect policy and the status the CRM will read. It never dials: after a link loss
 * during a call the call is "uncertain" and `canDial()` stays false until the adapter reports
 * the real call state, so recovery can never produce a second call.
 *
 * Adapter contract:
 *   connect({ attemptId })    → Promise; rejects if the platform refused outright
 *   disconnect({ attemptId }) → Promise; gateway-initiated close (also used to cancel a pending connect)
 * Events (each carries the attemptId it belongs to, except adapter/heartbeat events):
 *   slc_connected        { capabilities? }
 *   slc_disconnected     { initiator: 'gateway'|'remote', aclConnected: boolean, detail? }
 *   connect_failed       { detail }
 *   audio_opened | audio_closed { detail? } | audio_failed { detail }
 *   call_state           { state: 'idle'|'dialing'|'alerting'|'active' }
 *   adapter_removed | adapter_available | heartbeat
 */

export const STATES = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  BACKOFF: 'backoff',
  DISCONNECTING: 'disconnecting',
  FAILED: 'failed',
  ADAPTER_UNAVAILABLE: 'adapter_unavailable',
  STOPPED: 'stopped',
});

export const DISCONNECT_REASONS = Object.freeze({
  GATEWAY_REQUESTED: 'gateway_requested',
  REMOTE_CLOSED: 'remote_closed', // phone closed HFP, baseband still up
  LINK_LOST: 'link_lost', // baseband (ACL) went away
  ADAPTER_REMOVED: 'adapter_removed',
  CONNECT_TIMEOUT: 'connect_timeout',
  REJECTED: 'rejected',
});

export const DEFAULT_POLICY = Object.freeze({
  maxAttempts: 3, // per connect cycle, including the first try
  baseDelayMs: 2_000,
  maxDelayMs: 30_000,
  jitter: 0.1,
  connectTimeoutMs: 15_000,
  disconnectTimeoutMs: 5_000,
  staleAfterMs: 90_000,
});

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

/** Exponential backoff for attempt n (1-based), capped, with ±jitter. */
export function backoffDelay(attempt, policy = DEFAULT_POLICY, random = Math.random) {
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const spread = raw * policy.jitter;
  return Math.round(raw - spread + random() * 2 * spread);
}

export function createSessionController({ adapter, policy = {}, clock = realClock, random = Math.random, onChange = () => {} }) {
  const cfg = { ...DEFAULT_POLICY, ...policy };
  const startedAt = clock.now();
  let state = STATES.IDLE;
  let attempts = 0; // attempts in the current connect cycle
  let attemptSeq = 0;
  let currentAttempt = null;
  let reconnects = 0;
  let connectedSince = null;
  let lastDisconnect = null;
  let lastError = null;
  let ignoredEvents = 0;
  let lastHeartbeatAt = null;
  let nextRetryAt = null;
  let audio = { state: 'unavailable', lastError: null };
  let call = { state: 'idle' };
  let timer = null;
  let stopWaiters = [];

  const emit = (type, extra = {}) => onChange({ type, state, ...extra });
  const setState = (next, extra) => {
    if (next === state) return;
    state = next;
    emit('state', extra);
  };
  const clearTimer = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    nextRetryAt = null;
  };
  const fromCurrentAttempt = (ev) => ev?.attemptId !== undefined && ev.attemptId === currentAttempt;

  function attempt() {
    attempts += 1;
    attemptSeq += 1;
    currentAttempt = `a${attemptSeq}`;
    const id = currentAttempt;
    setState(STATES.CONNECTING, { attemptId: id, attempt: attempts });
    timer = clock.setTimeout(() => {
      timer = null;
      if (state !== STATES.CONNECTING || currentAttempt !== id) return;
      Promise.resolve(adapter.disconnect({ attemptId: id })).catch(() => {});
      failAttempt(DISCONNECT_REASONS.CONNECT_TIMEOUT, `no service-level connection within ${cfg.connectTimeoutMs} ms`);
    }, cfg.connectTimeoutMs);
    Promise.resolve()
      .then(() => adapter.connect({ attemptId: id }))
      .catch((err) => {
        if (state === STATES.CONNECTING && currentAttempt === id) failAttempt(DISCONNECT_REASONS.REJECTED, err?.message || String(err));
      });
  }

  function scheduleRetry(reason) {
    if (attempts >= cfg.maxAttempts) {
      currentAttempt = null;
      setState(STATES.FAILED, { reason });
      return;
    }
    const delay = backoffDelay(attempts, cfg, random);
    nextRetryAt = clock.now() + delay;
    currentAttempt = null;
    setState(STATES.BACKOFF, { reason, retryInMs: delay });
    timer = clock.setTimeout(() => {
      timer = null;
      nextRetryAt = null;
      if (state === STATES.BACKOFF) attempt();
    }, delay);
  }

  function failAttempt(reason, detail) {
    clearTimer();
    lastError = { reason, detail: detail ?? null, at: clock.now() };
    scheduleRetry(reason);
  }

  function onLinkDown(reason, initiator, detail) {
    lastDisconnect = { reason, initiator, detail: detail ?? null, at: clock.now(), connectedForMs: connectedSince ? clock.now() - connectedSince : 0 };
    connectedSince = null;
    audio = { state: 'unavailable', lastError: audio.lastError };
    // A call that was up (or being set up) when we lost the phone may still be running on the
    // handset. Never assume it ended; never allow a new dial until the phone tells us.
    if (call.state !== 'idle') call = { state: 'uncertain', since: clock.now() };
  }

  function finishStop() {
    clearTimer();
    currentAttempt = null;
    setState(STATES.STOPPED);
    const waiters = stopWaiters;
    stopWaiters = [];
    waiters.forEach((resolve) => resolve(status()));
  }

  function start() {
    if ([STATES.CONNECTING, STATES.CONNECTED, STATES.BACKOFF, STATES.DISCONNECTING].includes(state)) return status();
    if (state === STATES.ADAPTER_UNAVAILABLE) return status(); // wait for adapter_available
    attempts = 0;
    attempt();
    return status();
  }

  function stop(reason = 'shutdown') {
    if (state === STATES.STOPPED) return Promise.resolve(status());
    if (state === STATES.DISCONNECTING) return new Promise((resolve) => stopWaiters.push(resolve));
    clearTimer();
    if (state === STATES.CONNECTED || state === STATES.CONNECTING) {
      const id = currentAttempt;
      setState(STATES.DISCONNECTING, { reason });
      const done = new Promise((resolve) => stopWaiters.push(resolve));
      timer = clock.setTimeout(() => {
        timer = null;
        if (state !== STATES.DISCONNECTING) return;
        onLinkDown(DISCONNECT_REASONS.GATEWAY_REQUESTED, 'gateway', `no confirmation within ${cfg.disconnectTimeoutMs} ms (${reason})`);
        finishStop();
      }, cfg.disconnectTimeoutMs);
      Promise.resolve(adapter.disconnect({ attemptId: id })).catch(() => {});
      return done;
    }
    finishStop();
    return Promise.resolve(status());
  }

  function handle(ev) {
    switch (ev?.type) {
      case 'heartbeat':
        lastHeartbeatAt = clock.now();
        return;
      case 'adapter_removed':
        clearTimer();
        if (state === STATES.CONNECTED) onLinkDown(DISCONNECT_REASONS.ADAPTER_REMOVED, 'local', ev.detail);
        lastError = { reason: DISCONNECT_REASONS.ADAPTER_REMOVED, detail: ev.detail ?? null, at: clock.now() };
        currentAttempt = null;
        if (state !== STATES.STOPPED) setState(STATES.ADAPTER_UNAVAILABLE);
        return;
      case 'adapter_available':
        if (state === STATES.ADAPTER_UNAVAILABLE) {
          state = STATES.IDLE;
          start();
        }
        return;
      default:
        break;
    }

    if (!fromCurrentAttempt(ev)) {
      ignoredEvents += 1; // late callback from a retired attempt, or a malformed event
      return;
    }

    switch (ev.type) {
      case 'slc_connected':
        if (state !== STATES.CONNECTING) { ignoredEvents += 1; return; }
        clearTimer();
        if (lastDisconnect) reconnects += 1;
        attempts = 0;
        connectedSince = clock.now();
        lastError = null;
        setState(STATES.CONNECTED, { capabilities: ev.capabilities ?? null });
        return;
      case 'connect_failed':
        if (state === STATES.CONNECTING) failAttempt(DISCONNECT_REASONS.REJECTED, ev.detail);
        return;
      case 'slc_disconnected': {
        if (state === STATES.DISCONNECTING) {
          onLinkDown(DISCONNECT_REASONS.GATEWAY_REQUESTED, 'gateway', ev.detail);
          finishStop();
          return;
        }
        if (state === STATES.CONNECTING) {
          failAttempt(DISCONNECT_REASONS.REJECTED, ev.detail ?? 'closed during setup');
          return;
        }
        if (state !== STATES.CONNECTED) { ignoredEvents += 1; return; }
        const reason = ev.aclConnected ? DISCONNECT_REASONS.REMOTE_CLOSED : DISCONNECT_REASONS.LINK_LOST;
        onLinkDown(reason, ev.initiator ?? 'remote', ev.detail);
        currentAttempt = null;
        emit('disconnected', { reason });
        attempts = 1; // the lost connection counts as the first attempt of the reconnect cycle
        scheduleRetry(reason);
        return;
      }
      case 'audio_opened':
        audio = { state: 'open', lastError: null };
        emit('audio', { audio: audio.state });
        return;
      case 'audio_failed':
        audio = { state: 'failed', lastError: { detail: ev.detail ?? null, at: clock.now() } };
        emit('audio', { audio: audio.state });
        return;
      case 'audio_closed':
        if (call.state === 'active') {
          audio = { state: 'lost', lastError: { detail: ev.detail ?? 'audio closed during an active call', at: clock.now() } };
          emit('audio_lost'); // the agent must stop speaking and stop saving answers
        } else {
          audio = { state: 'closed', lastError: audio.lastError };
          emit('audio', { audio: audio.state });
        }
        return;
      case 'call_state':
        call = { state: ev.state, since: clock.now() };
        emit('call', { call: call.state });
        return;
      default:
        ignoredEvents += 1;
    }
  }

  function canDial() {
    return state === STATES.CONNECTED && call.state === 'idle';
  }

  function status() {
    const now = clock.now();
    const heartbeatAge = lastHeartbeatAt === null ? now - startedAt : now - lastHeartbeatAt;
    return {
      state,
      attempt: attempts,
      attemptId: currentAttempt,
      connectedSince,
      connectedForMs: connectedSince ? now - connectedSince : 0,
      reconnects,
      nextRetryAt,
      lastDisconnect,
      lastError,
      ignoredEvents,
      // Process health is reported separately: a late heartbeat makes the gateway "stale",
      // it does not by itself mean the phone disconnected.
      process: { lastHeartbeatAt, stale: heartbeatAge > cfg.staleAfterMs },
      audio: { ...audio },
      call: { ...call },
    };
  }

  return { start, stop, handle, status, canDial };
}
