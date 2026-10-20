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
import { waitForSipAnswer, once, silenceAction, waitUntilQuiet } from './callControl.js';

const safeJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const log = (msg, extra = {}) => console.log(JSON.stringify({ level: 'info', msg: `[voice-agent] ${msg}`, ...extra }));
const warn = (msg, extra = {}) => console.warn(JSON.stringify({ level: 'warn', msg: `[voice-agent] ${msg}`, ...extra }));
const RING_TIMEOUT_MS = Number(process.env.AGENT_RING_TIMEOUT_MS || 60_000);

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

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
        ...(usage ? { cost: { amount: 0, currency: 'USD', breakdown: { usage } } } : {}),
      }).catch((e) => warn('end tool call failed (the CRM reconciler will finish the call)', { callId, error: e?.message }));
    });

    let context;
    try {
      context = await api.context();
    } catch (error) {
      warn('could not load call context; hanging up', { callId, error: error?.message });
      await hangUp();
      return;
    }

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
    answeredAt = Date.now();
    await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));

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
    const nextFrom = async (res) => {
      pending = actionToInstruction(res.nextAction);
      await agent?.updateInstructions(withCurrentStep(baseInstructions, pending))
        .catch((e) => warn('updateInstructions failed', { callId, error: e?.message }));
      return pending;
    };
    // Tool errors go back to the model as text so it can recover (e.g. disclose first).
    const guarded = (fn) => async (args) => {
      try { return await fn(args || {}); } catch (error) { return `The CRM rejected that: ${error?.message || 'error'}. Follow the current instruction: ${pending}`; }
    };
    let session = null;
    let agentState = 'initializing';
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
        execute: guarded(async ({ fieldKey, answer }) => `Saved. Next: ${await nextFrom(await api.recordAnswer(fieldKey, answer))}`),
      }),
      mark_answer_unknown: llm.tool({
        description: 'The person does not know the answer to the current question.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: guarded(async ({ fieldKey }) => `Marked unknown. Next: ${await nextFrom(await api.markUnknown(fieldKey))}`),
      }),
      confirm: llm.tool({
        description: 'Confirm a critical answer the person just verified as correct.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: guarded(async ({ fieldKey }) => `Confirmed. Next: ${await nextFrom(await api.confirm(fieldKey))}`),
      }),
      disclose: llm.tool({
        description: 'Call once, after delivering the AI disclosure and the person agrees to continue.',
        execute: guarded(async () => `Disclosed. Next: ${await nextFrom(await api.disclose())}`),
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
    session.on(voice.AgentSessionEventTypes.Error, (ev) => warn('session error', { callId, error: String(ev?.error?.message || ev?.error || '') }));

    await session.start({ agent, room: ctx.room });

    // Kick off: tell the model to deliver the disclosure / first action.
    session.generateReply({ instructions: `Start the call now. ${pending}` });

    // Max-duration guard (the CRM reconciler is the backstop if this process dies).
    const maxMs = ((Number(config.maxCallSeconds) || 300) + 15) * 1000;
    const guard = setTimeout(() => { log('max call duration reached', { callId }); finish(null, 0); }, maxMs);

    // The callee hung up, or the room closed: finish whatever was collected.
    ctx.room.on?.('participantDisconnected', (p) => {
      if (isPstn && p?.identity === `sip-${callId}`) { clearTimeout(guard); finish(null, 0); }
    });
    ctx.room.on?.('disconnected', () => { clearTimeout(guard); endCall(null); });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'crm-voice-agent',
    // Health-check port (LiveKit's production default is 8081, which clashes with Metro locally).
    ...(process.env.AGENT_HEALTH_PORT ? { port: Number(process.env.AGENT_HEALTH_PORT) } : {}),
  }));
}
