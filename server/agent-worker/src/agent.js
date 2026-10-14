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
import { ToolApi, actionToInstruction } from './toolApi.js';

const safeJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();

    // LiveKit passes our per-call metadata (apiBase, token, callId, voice…) on the job.
    const meta = safeJson(ctx.job?.metadata) || {};
    const apiBase = meta.agentToolApi || process.env.AGENT_TOOL_API;
    const token = meta.agentToken;
    const callId = meta.callId || meta.internalCallId;
    if (!apiBase || !token || !callId) {
      console.error('[voice-agent] missing call metadata; leaving room', { hasApi: !!apiBase, hasToken: !!token, callId });
      return;
    }
    const api = new ToolApi({ apiBase, token, callId });

    // Pull the system prompt, disclosure, lead context and first action.
    const context = await api.context();
    let pending = actionToInstruction(context.nextAction);
    let finished = false;

    const nextFrom = (res) => { pending = actionToInstruction(res.nextAction); return pending; };

    // ---- the constrained tool set the model may call (keys become tool names) ----
    const tools = {
      record_answer: llm.tool({
        description: 'Record the person\'s answer to the current question.',
        parameters: z.object({ fieldKey: z.string(), answer: z.string() }),
        execute: async ({ fieldKey, answer }) => `Saved. Next: ${nextFrom(await api.recordAnswer(fieldKey, answer))}`,
      }),
      mark_answer_unknown: llm.tool({
        description: 'The person does not know the answer to the current question.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: async ({ fieldKey }) => `Marked unknown. Next: ${nextFrom(await api.markUnknown(fieldKey))}`,
      }),
      confirm: llm.tool({
        description: 'Confirm a critical answer the person just verified as correct.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: async ({ fieldKey }) => `Confirmed. Next: ${nextFrom(await api.confirm(fieldKey))}`,
      }),
      disclose: llm.tool({
        description: 'Call once, after delivering the AI disclosure and the person agrees to continue.',
        execute: async () => `Disclosed. Next: ${nextFrom(await api.disclose())}`,
      }),
      request_callback: llm.tool({
        description: 'The person asked to be called back. Capture the time and any note.',
        parameters: z.object({ when: z.string().optional(), note: z.string().optional() }),
        execute: async ({ when, note }) => { await api.requestCallback(when || null, note || null); return 'Acknowledge the callback, say goodbye, then call finish_call.'; },
      }),
      do_not_contact: llm.tool({
        description: 'The person asked to stop being called. Stop asking questions.',
        execute: async () => { await api.doNotContact(); return 'Apologise, confirm they will not be called again, say goodbye, then call finish_call.'; },
      }),
      decline: llm.tool({
        description: 'The person declined to participate in the questionnaire.',
        execute: async () => { await api.decline(); return 'Thank them for their time, say goodbye, then call finish_call.'; },
      }),
      finish_call: llm.tool({
        description: 'End the call. Call this after the closing line.',
        execute: async () => {
          finished = true;
          await api.end({ disposition: null }).catch(() => {});
          setTimeout(() => ctx.room?.disconnect?.().catch(() => {}), 1500);
          return 'Call ended.';
        },
      }),
    };

    const agent = new voice.Agent({
      instructions: `${context.systemPrompt}\n\nDisclosure to deliver first: ${context.disclosure}`,
      tools,
    });

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
        voice: meta.voice || process.env.OPENAI_REALTIME_VOICE || 'alloy',
        apiKey: process.env.OPENAI_API_KEY,
      }),
    });

    await session.start({ agent, room: ctx.room });

    // Kick off: tell the model to deliver the disclosure / first action.
    session.generateReply({ instructions: `Start the call now. ${pending}` });

    // Belt-and-braces max-duration guard beyond the backend timeout.
    const maxMs = ((context.agentConfig?.maxCallSeconds || 300) + 15) * 1000;
    const guard = setTimeout(() => {
      if (!finished) { api.end({ disposition: null }).catch(() => {}); ctx.room?.disconnect?.().catch(() => {}); }
    }, maxMs);

    ctx.room.on?.('disconnected', () => {
      clearTimeout(guard);
      if (!finished) api.end({ disposition: null }).catch(() => {}); // reconcile whatever was collected
    });
  },
});

cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.LIVEKIT_AGENT_NAME || 'crm-voice-agent',
}));
