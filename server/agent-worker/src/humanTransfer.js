/**
 * Human transfer for the voice worker, kept free of LiveKit imports so it is
 * unit-tested with fakes (node --test).
 *
 * request_human_transfer → POST /transfer. The CRM rings the configured people.
 *   - nobody available → the tool result IS the scripted fallback (spoken at once);
 *   - ringing → the agent asks the caller to hold, and watch() polls the CRM:
 *       accepted (web)   → one handover line, wait for the person to join, step back;
 *       accepted (phone) → one handover line, then the CRM performs the SIP transfer;
 *       declined / timeout / failed → scripted fallback + callback offer.
 * The CRM owns the timeout; the worker only stops polling after a grace period.
 */

export const HUMAN_IDENTITY_PREFIX = 'human-';
const DEFAULT_FALLBACK = 'I’m sorry, none of my colleagues can take the call right now. I can arrange for someone to call you back. When would suit you best?';

export function fallbackInstruction(fallback) {
  const script = fallback?.script || DEFAULT_FALLBACK;
  return [
    `Say this to the caller now, faithfully (if they are speaking another language, translate it faithfully into their language): "${script}"`,
    'If they give a time, call request_callback with the time in their own words and a short note. If they do not want a callback, continue with the current step.',
  ].join(' ');
}

export function holdInstruction(hold) {
  const line = hold?.text ? ` For example: "${hold.text}"` : '';
  return `Tell the caller, in their language, that you are connecting them with a colleague and ask them to stay on the line for a moment.${line} Then wait silently; do not ask any questions until you receive a new instruction.`;
}

export function createHumanTransfer({ api, pollMs = 1500, graceMs = 8000, joinTimeoutMs = 25_000, sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }), now = Date.now, warn = () => {} }) {
  let phase = 'idle'; // idle | ringing | connecting | handed_off | fallback
  let mode = null;
  let ringing = null;
  return {
    phase: () => phase,
    mode: () => mode,
    /** The agent must stay quiet: no silence prompts, no questionnaire steps. */
    holding: () => phase === 'ringing' || phase === 'connecting' || phase === 'handed_off',
    handedOff: () => phase === 'handed_off',

    /** Tool body: returns the text the model acts on, and whether watch() must run. */
    async request({ reason = '', summary = '' } = {}) {
      if (phase !== 'idle') return { instruction: 'A transfer was already attempted on this call. Do not try again; follow the current step.', watch: false };
      phase = 'ringing';
      let res;
      try {
        res = await api.requestTransfer(reason, summary);
      } catch (error) {
        warn('transfer request failed', error);
        phase = 'fallback';
        return { instruction: fallbackInstruction(null), watch: false, status: 'failed' };
      }
      if (res?.status === 'ringing') {
        ringing = res;
        return { instruction: holdInstruction(res.hold), watch: true, status: 'ringing' };
      }
      phase = 'fallback';
      return { instruction: fallbackInstruction(res?.fallback), watch: false, status: res?.status || 'failed' };
    },

    /**
     * Poll until the transfer resolves. io = {
     *   say(instructions): Promise  — speak one line and resolve once quiet,
     *   waitForHuman(timeoutMs): Promise<boolean>,
     *   handOff(mode): Promise      — step back (web) / let the SIP leg go (phone),
     *   fallback(instructions): void
     * }
     */
    async watch(io) {
      const deadline = now() + ((ringing?.timeoutSeconds ?? 30) * 1000) + graceMs;
      const toFallback = (fallback, status) => { phase = 'fallback'; io.fallback(fallbackInstruction(fallback)); return { status }; };
      for (;;) {
        await sleep(pollMs);
        let st;
        try {
          st = await api.transferStatus();
        } catch (error) {
          warn('transfer status failed', error);
          if (now() > deadline) return toFallback(null, 'failed');
          continue;
        }
        if (st?.status === 'ringing') {
          if (now() > deadline) return toFallback(st.fallback, 'timeout');
          continue;
        }
        if (st?.status !== 'accepted') return toFallback(st?.fallback, st?.status || 'failed');
        phase = 'connecting';
        const who = st.targetName || 'a colleague';
        if (st.mode === 'phone') {
          await io.say(`Tell the caller, in their language and in one short sentence, that you are transferring them now to ${who}. Then stop talking.`);
          let ex;
          try { ex = await api.executeTransfer(); } catch (error) { warn('phone transfer failed', error); ex = { status: 'failed', fallback: null }; }
          if (ex?.status !== 'transferred') return toFallback(ex?.fallback, 'failed');
          phase = 'handed_off';
          mode = 'phone';
          await io.handOff('phone');
          return { status: 'accepted', mode };
        }
        await io.say(`Tell the caller, in their language and in one short sentence, that ${who} is joining the call now. Then stop talking.`);
        const joined = await io.waitForHuman(joinTimeoutMs);
        if (!joined) return toFallback(st.fallback, 'failed');
        await api.transferJoined().catch((error) => warn('transfer joined report failed', error));
        phase = 'handed_off';
        mode = 'web';
        await io.handOff('web');
        return { status: 'accepted', mode };
      }
    },
  };
}

/** Resolve true once a participant whose identity starts with human- is in the room. */
export function waitForHumanParticipant(room, timeoutMs) {
  return new Promise((resolve) => {
    const isHuman = (p) => String(p?.identity || '').startsWith(HUMAN_IDENTITY_PREFIX);
    for (const p of room?.remoteParticipants?.values?.() || []) if (isHuman(p)) { resolve(true); return; }
    const onJoin = (p) => { if (isHuman(p)) done(true); };
    const timer = setTimeout(() => done(false), timeoutMs);
    function done(result) { clearTimeout(timer); room?.off?.('participantConnected', onJoin); resolve(result); }
    room?.on?.('participantConnected', onJoin);
  });
}
