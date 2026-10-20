/**
 * Call-control helpers for the voice worker, kept free of LiveKit imports so
 * they are unit-tested with `node --test` against a fake room.
 */

export const SIP_STATUS_ATTR = 'sip.callStatus';
// rtc-node RoomEvent string values (stable across 1.x).
const EV_ATTRS = 'participantAttributesChanged';
const EV_CONNECTED = 'participantConnected';
const EV_DISCONNECTED = 'participantDisconnected';

/**
 * Wait until the PSTN callee actually answers. With `wait_until_answered:false`
 * the SIP participant joins while still dialling; only `sip.callStatus ===
 * 'active'` means a person (or a voicemail box) picked up.
 *
 * @returns {Promise<'answered'|'hangup'|'timeout'>}
 */
export function waitForSipAnswer(room, identity, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      room.off?.(EV_ATTRS, onAttrs);
      room.off?.(EV_CONNECTED, onConnected);
      room.off?.(EV_DISCONNECTED, onDisconnected);
      resolve(result);
    };
    const check = (participant) => {
      if (participant?.identity !== identity) return;
      const status = participant.attributes?.[SIP_STATUS_ATTR];
      if (status === 'active') finish('answered');
      else if (status === 'hangup') finish('hangup');
    };
    const onAttrs = (_changed, participant) => check(participant);
    const onConnected = (participant) => check(participant);
    const onDisconnected = (participant) => { if (participant?.identity === identity) finish('hangup'); };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);

    room.on?.(EV_ATTRS, onAttrs);
    room.on?.(EV_CONNECTED, onConnected);
    room.on?.(EV_DISCONNECTED, onDisconnected);
    // The participant may already be present (and even already active).
    const existing = room.remoteParticipants?.get?.(identity);
    if (existing) check(existing);
  });
}

/** Run an async function at most once; later calls get the first promise. */
export function once(fn) {
  let promise = null;
  return (...args) => {
    if (!promise) promise = Promise.resolve().then(() => fn(...args));
    return promise;
  };
}

/**
 * Silence policy: the first "away" prompts the caller, the second ends the call.
 * Returns the action for the n-th consecutive away period.
 */
export function silenceAction(consecutiveAway) {
  return consecutiveAway <= 1 ? 'prompt' : 'end';
}

/**
 * Resolve once the agent has finished talking, so a hang-up never cuts the goodbye.
 * The realtime model often calls finish_call *before* speaking its goodbye, so we wait
 * at least `minMs`. While it is speaking we wait for it to stop; a "thinking" agent gets
 * `thinkingGraceMs` to start speaking (after finish_call it can sit in "thinking" with
 * nothing to say). Everything is capped at `maxMs`.
 *
 * @param {{ on: Function, off: Function }} session emits `agent_state_changed` ({ newState })
 * @param {() => string} getState current agent state
 */
export function waitUntilQuiet(session, getState, { minMs = 1500, maxMs = 12_000, thinkingGraceMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let minPassed = false;
    let graceTimer = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      clearTimeout(graceTimer);
      session.off?.('agent_state_changed', onState);
      resolve();
    };
    const evaluate = (state) => {
      if (!minPassed) return;
      clearTimeout(graceTimer);
      if (state === 'speaking') return;
      if (state === 'thinking') { graceTimer = setTimeout(finish, thinkingGraceMs); return; }
      finish();
    };
    const onState = (ev) => evaluate(ev?.newState);
    const minTimer = setTimeout(() => { minPassed = true; evaluate(getState()); }, minMs);
    const maxTimer = setTimeout(finish, maxMs);
    session.on?.('agent_state_changed', onState);
  });
}
