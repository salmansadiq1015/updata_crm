/**
 * Updata CRM — LiveKit Voice Agent worker  (targets @livekit/agents ^1.9).
 *
 * A standalone process (NOT part of the Express API) that LiveKit dispatches into
 * a room when the CRM places a call (real PSTN via SIP, or a browser WebRTC test).
 * It runs an OpenAI Realtime session for low-latency, barge-in-capable speech, and
 * bridges the conversation to the CRM's constrained agent tool API. The CRM remains
 * the authority: this worker proposes answers; the backend validates, stores, and
 * decides the flow + status.
 *
 * Call lifecycle (PSTN):
 *   join room → fetch context → WAIT for the SIP leg to be answered
 *   (sip.callStatus=active; never speak into a ringing line) → POST /answered →
 *   start the realtime session → tools drive the questionnaire → finish_call /
 *   voicemail / silence / max-duration → POST /end (once) → delete the room,
 *   which hangs up the SIP leg.
 *
 * Call lifecycle (browser — SMS link page or the CRM's Live test):
 *   join room → fetch context → WAIT for the customer to join → POST /answered →
 *   start the realtime session → … → the customer leaving ends the call. Link
 *   conversations also forward each finished utterance to /transcript.
 *
 * Run:  npm start   (prod)  ·  npm run dev   (local)  ·  npm run download-files (once)
 * Env:  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, OPENAI_API_KEY
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  cli, defineAgent, voice, llm, WorkerOptions,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { ToolApi, actionToInstruction, withCurrentStep } from './toolApi.js';
import {
  waitForSipAnswer, once, silenceAction, waitUntilQuiet, createHeard, createAnswerGate, openCall,
} from './callControl.js';

const safeJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const log = (msg, extra = {}) => console.log(JSON.stringify({ level: 'info', msg: `[voice-agent] ${msg}`, ...extra }));
const warn = (msg, extra = {}) => console.warn(JSON.stringify({ level: 'warn', msg: `[voice-agent] ${msg}`, ...extra }));
const RING_TIMEOUT_MS = Number(process.env.AGENT_RING_TIMEOUT_MS || 60_000);

/**
 * End-of-turn detection. Server VAD answers ~0.6 s after the person stops talking;
 * semantic VAD (OPENAI_REALTIME_TURN_DETECTION=semantic) waits for a "finished"
 * sentence, which measured 2.5–5 s per reply on browser calls.
 */
export function turnDetection(env = process.env) {
  if (env.OPENAI_REALTIME_TURN_DETECTION === 'semantic') {
    return { type: 'semantic_vad', eagerness: env.OPENAI_REALTIME_EAGERNESS || 'high', create_response: true, interrupt_response: true };
  }
  return {
    type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
    silence_duration_ms: Number(env.OPENAI_REALTIME_SILENCE_MS) || 600, create_response: true, interrupt_response: true,
  };
}

/** Transcript language hint (the model itself hears the audio; this only steers the written transcript). */
export function transcription(language) {
  const base = { model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' };
  if (language === 'en') return { ...base, language: 'en' };
  if (language === 'ur') return { ...base, language: 'ur' };
  return { ...base, prompt: 'A customer in Pakistan answering in Urdu or English (often mixed).' };
}

export default defineAgent({
  entry: async (ctx) => {
    const startedAt = Date.now();
    // LiveKit passes our per-call metadata (apiBase, token, callId, voice…) on the job.
    const meta = safeJson(ctx.job?.metadata) || {};
    const apiBase = meta.agentToolApi || process.env.AGENT_TOOL_API;
    const token = meta.agentToken;
    const callId = meta.callId || meta.internalCallId;
    const isPstn = meta.mode !== 'web';
    if (!apiBase || !token || !callId) {
      warn('missing call metadata; hanging up', { hasApi: !!apiBase, hasToken: !!token, callId });
      await ctx.deleteRoom().catch(() => {});
      return;
    }
    const api = new ToolApi({ apiBase, token, callId });
    const hangUp = once(() => ctx.deleteRoom().catch((e) => warn('deleteRoom failed', { callId, error: e?.message })));

    let answeredAt = null;
    let usage = null;
    // /end is sent exactly once, whichever path ends the call first.
    const endCall = once(async (disposition = null) => {
      const durationSeconds = answeredAt ? Math.round((Date.now() - answeredAt) / 1000) : 0;
      await api.end({
        disposition,
        durationSeconds,
        roomName: ctx.room?.name || meta.roomName || null,
        ...(usage ? { cost: { amount: 0, currency: 'USD', breakdown: { usage } } } : {}),
      }).catch((e) => warn('end tool call failed (the CRM reconciler will finish the call)', { callId, error: e?.message }));
    });

    // Join the room and load the call context at the same time.
    let context;
    const timed = (promise) => promise.then((value) => ({ value, ms: Date.now() - startedAt }));
    const [joinedRoom, loaded] = await Promise.allSettled([timed(ctx.connect()), timed(api.context())]);
    if (joinedRoom.status === 'rejected') {
      warn('could not join the room', { callId, error: joinedRoom.reason?.message });
      await endCall('failed');
      return;
    }
    if (loaded.status === 'rejected') {
      warn('could not load call context; hanging up', { callId, error: loaded.reason?.message });
      await hangUp();
      return;
    }
    context = loaded.value.value;
    log('call ready', { callId, roomJoinMs: joinedRoom.value.ms, contextMs: loaded.value.ms });

    // ---- Wait for a real answer before saying anything (PSTN only).
    if (isPstn) {
      const result = await waitForSipAnswer(ctx.room, `sip-${callId}`, RING_TIMEOUT_MS);
      if (result !== 'answered') {
        log('call not answered', { callId, result });
        await endCall('no_answer');
        await hangUp();
        return;
      }
    }
    if (isPstn) {
      answeredAt = Date.now();
      await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));
      log('customer joined; realtime session ready', { callId, ms: Date.now() - startedAt });
    }

    const config = context.agentConfig || {};
    const baseInstructions = [
      context.systemPrompt,
      `Disclosure to deliver first, word for word: "${context.disclosure}"`,
      'If you hear an automated voicemail greeting instead of a person, call reached_voicemail immediately and say nothing.',
      'Never invent answers. If a tool call is rejected, follow the instruction it returns.',
    ].join('\n\n');
    let pending = actionToInstruction(context.nextAction);
    let agent = null;
    // The realtime model only sees its instructions on ordinary turns, so the current
    // step must live there too — otherwise it improvises questions between tool calls.
    // Not awaited: the tool's return value already tells the model the next step, so
    // the reply need not wait for another round trip to OpenAI.
    const nextFrom = async (res) => {
      pending = actionToInstruction(res.nextAction);
      agent?.updateInstructions(withCurrentStep(baseInstructions, pending))
        .catch((e) => warn('updateInstructions failed', { callId, error: e?.message }));
      return pending;
    };
    // Tool errors go back to the model as text so it can recover (e.g. disclose first).
    const guarded = (fn) => async (args) => {
      try { return await fn(args || {}); } catch (error) { return `The CRM rejected that: ${error?.message || 'error'}. Follow the current instruction: ${pending}`; }
    };
    let session = null;
    let agentState = 'initializing';
    // The person's own words for confirmations (the model tends to pass the value instead).
    const heard = createHeard();
    const gate = createAnswerGate(heard);
    // A step the person has not answered yet is refused, so the model asks and waits instead.
    const gated = (fn) => guarded(async (args) => {
      if (!gate.allow()) {
        return 'Refused: they have not said anything since your last step. Ask the question (or for their agreement) and wait for their reply. Never assume an answer.';
      }
      const result = await fn(args);
      gate.advance();
      return result;
    });
    const finish = async (disposition = null, delayMs = 1500) => {
      // Let the goodbye play out BEFORE /end: the CRM deletes the room as soon as it has
      // processed the call, which would cut the agent off mid-sentence. Callee gone, time
      // limit or voicemail (delayMs < 1s) end immediately.
      if (delayMs >= 1000 && session) await waitUntilQuiet(session, () => agentState, { minMs: delayMs });
      else if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      await endCall(disposition);
      await hangUp();
    };

    // ---- the constrained tool set the model may call (keys become tool names) ----
    const tools = {
      record_answer: llm.tool({
        description: 'Record the person\'s answer to the current question, in their own words.',
        parameters: z.object({ fieldKey: z.string(), answer: z.string() }),
        execute: gated(async ({ fieldKey, answer }) => `Saved. Next: ${await nextFrom(await api.recordAnswer(fieldKey, answer))}`),
      }),
      mark_answer_unknown: llm.tool({
        description: 'The person does not know the answer to the current question.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: gated(async ({ fieldKey }) => `Marked unknown. Next: ${await nextFrom(await api.markUnknown(fieldKey))}`),
      }),
      confirm: llm.tool({
        description: 'The person said yes to your read-back of a critical answer.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: guarded(async ({ fieldKey }) => {
          const res = await api.confirm(fieldKey, await heard.latest());
          const next = await nextFrom(res);
          return res.confirmed === false ? `Not confirmed; a person will check it later. Do not ask again. Next: ${next}` : `Confirmed. Next: ${next}`;
        }),
      }),
      disclose: llm.tool({
        description: 'Call once, after delivering the AI disclosure and the person agrees to continue.',
        execute: gated(async () => `Disclosed. Next: ${await nextFrom(await api.disclose())}`),
      }),
      request_human: llm.tool({
        description: 'The person asked to speak to a human / a real person / a team member.',
        execute: guarded(async () => { await api.requestCallback(null, 'Asked to speak to a person', true); return 'Tell them a team member will contact them, say goodbye, then call finish_call.'; }),
      }),
      request_callback: llm.tool({
        description: 'The person asked to be called back. Capture the time and any note.',
        parameters: z.object({ when: z.string().optional(), note: z.string().optional() }),
        execute: guarded(async ({ when, note }) => { await api.requestCallback(when || null, note || null); return 'Acknowledge the callback, say goodbye, then call finish_call.'; }),
      }),
      do_not_contact: llm.tool({
        description: 'The person asked to stop being called. Stop asking questions.',
        execute: guarded(async () => { await api.doNotContact(); return 'Apologise, confirm they will not be called again, say goodbye, then call finish_call.'; }),
      }),
      decline: llm.tool({
        description: 'The person declined to participate in the questionnaire.',
        execute: guarded(async () => { await api.decline(); return 'Thank them for their time, say goodbye, then call finish_call.'; }),
      }),
      reached_voicemail: llm.tool({
        description: 'You reached an answering machine / voicemail greeting, not a person. Do NOT leave a message.',
        execute: async () => { await finish('voicemail', 200); return undefined; },
      }),
      finish_call: llm.tool({
        description: 'End the call. Call this after the closing line.',
        // No return value → agents-js generates no follow-up reply (anything returned would be spoken).
        execute: async () => { finish(null); return undefined; },
      }),
    };

    agent = new voice.Agent({ instructions: withCurrentStep(baseInstructions, pending), tools });

    session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
        voice: meta.voice || config.voice || process.env.OPENAI_REALTIME_VOICE || 'alloy',
        apiKey: process.env.OPENAI_API_KEY,
        turnDetection: turnDetection(),
        inputAudioTranscription: transcription(meta.language || config.language),
        ...(isPstn ? {} : { inputAudioNoiseReduction: { type: 'near_field' } }),
      }),
      // Campaign config: silence → "away" after N seconds; barge-in on/off.
      userAwayTimeout: Math.max(2, Number(config.silenceTimeoutSeconds) || 8),
      turnHandling: { interruption: { enabled: config.allowBargeIn !== false } },
    });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => { agentState = ev.newState; });

    let awayStreak = 0;
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState !== 'away') { awayStreak = 0; return; }
      awayStreak += 1;
      if (silenceAction(awayStreak) === 'prompt') {
        session.generateReply({ instructions: 'The caller has gone quiet. Briefly ask if they are still there.' });
      } else {
        log('caller silent; ending call', { callId });
        session.generateReply({ instructions: 'Say a brief, polite goodbye.' });
        finish(null, 3000);
      }
    });
    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => { usage = ev.usage; });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => { if (ev.newState === 'speaking') heard.onSpeaking(); });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => { if (ev.isFinal) heard.onTranscript(ev.transcript); });
    // Link conversations keep a written transcript in the CRM (finished utterances only).
    if (context.persistTranscript) {
      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
        const item = ev?.item;
        if (!item || (item.role !== 'user' && item.role !== 'assistant')) return;
        const text = typeof item.textContent === 'string' ? item.textContent.trim() : '';
        if (!text) return;
        api.transcript(item.role === 'user' ? 'customer' : 'assistant', text, item.id || null)
          .catch((e) => warn('transcript upload failed', { callId, error: e?.message }));
      });
    }
    session.on(voice.AgentSessionEventTypes.Error, (ev) => warn('session error', { callId, error: String(ev?.error?.message || ev?.error || '') }));

    await session.start({ agent, room: ctx.room });

    // ---- Browser calls: the realtime session is already connected while the
    // customer's browser joins; nobody to talk to until it has.
    if (!isPstn) {
      const joined = await Promise.race([
        ctx.waitForParticipant().then(() => true),
        new Promise((resolve) => { setTimeout(() => resolve(false), RING_TIMEOUT_MS); }),
      ]);
      if (!joined) {
        log('browser participant never joined', { callId });
        await finish(null, 0);
        return;
      }
      answeredAt = Date.now();
      await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));
    }

    // Kick off: tell the model to deliver the disclosure / first action. On a phone call,
    // let the callee's "Hello?" finish first (see openCall in callControl.js).
    const opener = () => {
      gate.reset(); // a "Hello?" before the disclosure is not agreement to continue
      return session.generateReply({ instructions: `Start the call now. ${pending}` });
    };
    if (isPstn) {
      let userState = 'listening';
      session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => { userState = ev.newState; });
      openCall(session, { userState: () => userState, agentState: () => agentState, generate: opener })
        .then((result) => log('call opened', { callId, result, ms: Date.now() - answeredAt }));
    } else {
      opener();
    }

    // Max-duration guard (the CRM reconciler is the backstop if this process dies).
    const maxMs = ((Number(config.maxCallSeconds) || 300) + 15) * 1000;
    const guard = setTimeout(() => { log('max call duration reached', { callId }); finish(null, 0); }, maxMs);

    // The callee hung up, or the room closed: finish whatever was collected.
    ctx.room.on?.('participantDisconnected', (p) => {
      const caller = isPstn ? p?.identity === `sip-${callId}` : !String(p?.identity || '').startsWith('agent-');
      if (caller) { clearTimeout(guard); finish(null, 0); }
    });
    ctx.room.on?.('disconnected', () => { clearTimeout(guard); endCall(null); });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'crm-voice-agent',
    // Pre-started job processes make a call start ~1 s faster (production default: up to 4).
    ...(process.env.AGENT_IDLE_PROCESSES ? { numIdleProcesses: Number(process.env.AGENT_IDLE_PROCESSES) } : {}),
    // Health-check port (LiveKit's production default is 8081, which clashes with Metro locally).
    ...(process.env.AGENT_HEALTH_PORT ? { port: Number(process.env.AGENT_HEALTH_PORT) } : {}),
  }));
}
