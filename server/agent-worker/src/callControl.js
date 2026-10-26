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

/**
 * Opening an answered phone call. People answer with "Hello?": speaking over that greeting
 * makes the realtime model cancel its first reply, and the next one can come out silent, so
 * the lead waited for the 8 s silence timer (seen in the paired-phone live test). Instead:
 *   - give the callee `quietMs` to start their greeting; if they do, let them finish (bounded);
 *   - then deliver the opener;
 *   - if the agent still has not started speaking `retryAfterMs` later, ask once more.
 * Resolves with 'spoke' | 'retried' | 'gave_up' (for logs and tests).
 *
 * @param {{ on: Function, off: Function }} session emits user_state_changed / agent_state_changed ({ newState })
 * @param {{ userState: () => string, agentState: () => string, generate: () => void }} io
 */
export function openCall(session, io, { quietMs = 1200, maxGreetingMs = 4000, retryAfterMs = 3500 } = {}) {
  return new Promise((resolve) => {
    let opened = false;
    let retried = false;
    let done = false;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const finish = (result) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      session.off?.('user_state_changed', onUser);
      session.off?.('agent_state_changed', onAgent);
      resolve(result);
    };
    const open = () => {
      if (opened) return;
      opened = true;
      io.generate();
      later(retryAfterMs, () => {
        if (io.agentState() === 'speaking') return;
        retried = true;
        io.generate();
        later(retryAfterMs, () => finish(io.agentState() === 'speaking' ? 'retried' : 'gave_up'));
      });
    };
    const onUser = (ev) => {
      if (opened) return;
      // The greeting ended: answer it.
      if (ev?.newState === 'listening' || ev?.newState === 'away') open();
    };
    const onAgent = (ev) => {
      if (ev?.newState === 'speaking' && opened) finish(retried ? 'retried' : 'spoke');
    };
    session.on?.('user_state_changed', onUser);
    session.on?.('agent_state_changed', onAgent);
    later(quietMs, () => { if (io.userState() !== 'speaking') open(); });
    later(maxGreetingMs, open); // a long greeting or noise: speak anyway
  });
}

/**
 * What the person actually said last, from the realtime transcript (not the model's
 * paraphrase). Speech turns and final transcripts are counted; latest() waits briefly
 * for the transcript of the newest turn, which can land just after the model's tool call,
 * and returns null if it never comes.
 */
export function createHeard() {
  let turns = 0;
  let transcribed = 0;
  let text = null;
  let waiters = [];
  return {
    turns() { return turns; },
    onSpeaking() { turns += 1; },
    onTranscript(value) {
      const clean = String(value || '').trim();
      if (!clean) return;
      transcribed = Math.max(transcribed + 1, turns);
      text = clean;
      waiters.forEach((w) => w());
      waiters = [];
    },
    async latest(timeoutMs = 2500) {
      if (transcribed < turns) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, timeoutMs);
          waiters.push(() => { clearTimeout(timer); resolve(); });
        });
      }
      // Newest turn still not transcribed: no evidence either way (never an older sentence).
      return transcribed >= turns ? text : null;
    },
  };
}

/**
 * One questionnaire step per thing the person said. The realtime model sometimes records an
 * answer the person never gave (found by the paired-phone E2E: it disclosed, then saved "yes, still
 * operating" before the lead had said a word, and the lead's real answer was "no, we closed").
 * A step that moves the questionnaire on (disclose, record_answer, mark_answer_unknown) is only
 * accepted after a new speech turn since the previous step, or since the opener was sent (what
 * they said before hearing the disclosure is not agreement).
 */
export function createAnswerGate(heard) {
  let mark = heard.turns();
  return {
    reset() { mark = heard.turns(); },
    allow() { return heard.turns() > mark; },
    advance() { mark = heard.turns(); },
  };
}
