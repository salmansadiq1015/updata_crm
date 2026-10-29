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
import { ToolApi, actionToInstruction, answerResultInstruction, withCurrentStep } from './toolApi.js';
import { createTranscriptPublisher } from './transcriptPublisher.js';
import { randomUUID } from 'node:crypto';
import { createSilenceWatchdog } from './silenceWatchdog.js';
import { createQualityTelemetry, attachQualityTelemetry } from './qualityTelemetry.js';
import {
  AGENT_ERROR_ATTRIBUTE, crmUnreachable, explainRealtimeFailure, failure, probeOpenAI,
} from './failures.js';
import {
  waitForSipAnswer, once, waitUntilQuiet, createHeard, createAnswerGate, openCall,
} from './callControl.js';
import { createHumanTransfer, waitForHumanParticipant } from './humanTransfer.js';
import { transcription, turnDetection } from './transcription.js';
import { billingUsage } from './billingUsage.js';
export { transcription, turnDetection } from './transcription.js';

const safeJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const log = (msg, extra = {}) => console.log(JSON.stringify({ level: 'info', msg: `[voice-agent] ${msg}`, ...extra }));
const warn = (msg, extra = {}) => console.warn(JSON.stringify({ level: 'warn', msg: `[voice-agent] ${msg}`, ...extra }));
const RING_TIMEOUT_MS = Number(process.env.AGENT_RING_TIMEOUT_MS || 60_000);
// How long a failed browser call waits for the tester to join, so they can read why.
const FAILURE_NOTICE_WAIT_MS = 15_000;
const realtimeModel = () => process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';

export default defineAgent({
  entry: async (ctx) => {
    const startedAt = Date.now();
    const callModel = realtimeModel();
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
    const transcripts = createTranscriptPublisher(api, { warn: (message, extra) => warn(message, { callId, ...extra }) });
    let session = null;
    const flushTranscripts = async (timeoutMs = 3000) => {
      for (const item of (session?.history?.items || []).slice(-100)) transcripts.add(item);
      await transcripts.flush(timeoutMs);
    };
    ctx.addShutdownCallback?.(() => flushTranscripts(5000));
    const hangUp = once(() => ctx.deleteRoom().catch((e) => warn('deleteRoom failed', { callId, error: e?.message })));

    let silenceWatchdog = null;
    let answeredAt = null;
    let usage = null;
    let callNotes = null;
    const quality = createQualityTelemetry({ vadSilenceMs: turnDetection().silence_duration_ms ?? null });
    // /end is sent exactly once, whichever path ends the call first.
    const endCall = once(async (disposition = null, reason = null) => {
      silenceWatchdog?.stop();
      const durationSeconds = answeredAt ? Math.round((Date.now() - answeredAt) / 1000) : 0;
      await flushTranscripts();
      // SDK usage is a cumulative session snapshot, not another usage event to add.
      const finalUsage = billingUsage(session?.usage || usage, { model: callModel });
      await api.end({
        disposition,
        durationSeconds,
        ...(callNotes ? { callNotes } : {}),
        roomName: ctx.room?.name || meta.roomName || null,
        ...(finalUsage ? { cost: { amount: 0, currency: 'USD', breakdown: { usage: finalUsage } } } : {}),
        quality: (answeredAt && quality.markAnswered(), quality.summary(session?.history?.items)),
        ...(reason ? { failureCode: reason.code, failureMessage: reason.message.slice(0, 500) } : {}),
      }).catch((e) => warn('end tool call failed (the CRM reconciler will finish the call)', { callId, error: e?.message }));
    });

    // The call cannot run (OpenAI key rejected, CRM unreachable…): tell the tester why
    // (agent participant attribute, read by the browser), record it on the call, hang up.
    let failed = false;
    let failedSignal;
    const failedPromise = new Promise((resolve) => { failedSignal = resolve; });
    const fail = once(async (reason) => {
      failed = true;
      failedSignal();
      warn('call failed', { callId, code: reason.code, reason: reason.message });
      await ctx.room?.localParticipant?.setAttributes({ [AGENT_ERROR_ATTRIBUTE]: JSON.stringify(reason) })
        .catch((e) => warn('could not publish the failure to the room', { callId, error: e?.message }));
      if (!isPstn) {
        // A browser tester may still be joining: keep the room open until they can see the
        // reason (the CRM closes the room once it has processed /end).
        const joined = ctx.room?.remoteParticipants?.size > 0 || await Promise.race([
          ctx.waitForParticipant().then(() => true, () => false),
          new Promise((resolve) => { setTimeout(() => resolve(false), FAILURE_NOTICE_WAIT_MS); }),
        ]);
        if (joined) await new Promise((resolve) => { setTimeout(resolve, 1500); });
      }
      await endCall('failed', reason);
      await hangUp();
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
      await fail(crmUnreachable(apiBase, loaded.reason));
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      await fail(failure('OPENAI_KEY_MISSING'));
      return;
    }
    context = loaded.value.value;
    log('call ready', { callId, roomJoinMs: joinedRoom.value.ms, contextMs: loaded.value.ms });
    // A gateway must not dial while the worker is still loading its call context.
    await ctx.room.localParticipant.setAttributes({ 'updata.agent_ready': 'true' });

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
      'You hear the caller audio directly. The written input transcript is produced by a separate speech recognizer and may contain errors. Ground answers in what you actually hear; do not override clear spoken information with a garbled transcript. If the audio itself is unclear, say you did not catch it and ask for a repeat or spelling. Do not tell the caller their answer is wrong because recognition failed. Read back names, complete email addresses, phone numbers and dates of birth when uncertain before saving them.',
      'Save each relevant answer promptly. If the person volunteers several configured answers, use record_answers. For unrelated or unintelligible replies, use no_response for the current question. The CRM repeats an unanswered question up to three times, then moves on. Do not mark silence or irrelevant speech as an answer. Do not use mark_answer_unknown unless the person explicitly says they do not know or prefer to skip. Stop immediately for decline, do-not-contact or human/callback requests.',
      'When calling finish_call, include private CRM notes: a brief description of the conversation, a factual summary of the lead responses and next steps, and blockers explicitly raised by the lead. Use an empty blockers list if none were stated. Never infer objections or commitments. Also give the overall tone of the lead (positive, neutral, hesitant or negative) judged only from what they said, with a short quote or paraphrase as evidence; use neutral when unclear. These notes are not spoken aloud.',
    ].join('\n\n');
    let pendingAction = context.nextAction;
    let pending = actionToInstruction(pendingAction);
    let agent = null;
    // The realtime model only sees its instructions on ordinary turns, so the current
    // step must live there too — otherwise it improvises questions between tool calls.
    // Refresh instructions before returning the tool result so the next response
    // cannot start with the previous questionnaire step.
    const nextFrom = async (res) => {
      silenceWatchdog?.cancel();
      pendingAction = res.nextAction;
      pending = actionToInstruction(pendingAction);
      await agent?.updateInstructions(withCurrentStep(baseInstructions, pending))
        .catch((e) => warn('updateInstructions failed', { callId, error: e?.message }));
      return pending;
    };
    // Tool errors go back to the model as text so it can recover (e.g. disclose first).
    const guarded = (fn) => async (args) => {
      try { return await fn(args || {}); } catch (error) { return `The CRM rejected that: ${error?.message || 'error'}. Follow the current instruction: ${pending}`; }
    };
    let agentState = 'initializing';
    // The person's own words for confirmations (the model tends to pass the value instead).
    const heard = createHeard();
    const gate = createAnswerGate(heard);
    const transfer = createHumanTransfer({ api, warn: (message, error) => warn(message, { callId, error: error?.message }) });
    const responseRequests = new Map();
    const responseId = (kind, fieldKey, turn) => {
      const key = `${kind}:${fieldKey}:${turn}`;
      if (!responseRequests.has(key)) responseRequests.set(key, randomUUID());
      if (responseRequests.size > 100) responseRequests.delete(responseRequests.keys().next().value);
      return responseRequests.get(key);
    };
    // A step the person has not answered yet is refused, so the model asks and waits instead.
    const gated = (fn) => guarded(async (args) => {
      if (gate.busy()) return 'A previous response is still being saved. Wait for its tool result before continuing.';
      const claim = gate.claim();
      if (!claim) {
        return 'Refused: they have not said anything since your last step. Ask the question (or for their agreement) and wait for their reply. Never assume an answer.';
      }
      try {
        const result = await fn(args, claim.turn);
        claim.complete();
        return result;
      } finally {
        claim.release();
        // A tool result may not cause another SDK state transition (e.g. after a
        // failed generation). Keep the silence recovery armed for the next step.
        if (opened) silenceWatchdog?.arm();
      }
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
      record_answers: llm.tool({
        description: 'When the person explicitly volunteers answers to several configured questions in one reply, save them together. Use only questionnaire field keys and their spoken information. Do not infer missing answers.',
        parameters: z.object({ answers: z.array(z.object({ fieldKey: z.string(), rawAnswer: z.string() })).min(1).max(40) }),
        execute: gated(async ({ answers }) => {
          const result = await api.recordAnswers(answers);
          return `Validation results: ${JSON.stringify(result.validations)}. Next: ${await nextFrom(result)}`;
        }),
      }),
      record_answer: llm.tool({
        description: 'Record the person\'s answer to the current question, in their own words.',
        parameters: z.object({ fieldKey: z.string(), answer: z.string() }),
        execute: gated(async ({ fieldKey, answer }) => {
          const result = await api.recordAnswer(fieldKey, answer);
          return answerResultInstruction(result, await nextFrom(result));
        }),
      }),
      no_response: llm.tool({
        description: 'The person spoke but did not answer the current question: their reply was unrelated or unintelligible. Never save it as a valid answer. The CRM decides whether to repeat or move to the next question.',
        parameters: z.object({ fieldKey: z.string(), reason: z.enum(['unrelated', 'unintelligible']) }),
        execute: gated(async ({ fieldKey, reason }, turn) => {
          return `No answer recorded. Next: ${await nextFrom(await api.noResponse(fieldKey, reason, responseId('no-response', fieldKey, turn)))}`;
        }),
      }),
      mark_answer_unknown: llm.tool({
        description: 'The person explicitly said they do not know, prefer not to share, or want to skip this question. Never use this for unrelated, incomplete or unintelligible replies.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: gated(async ({ fieldKey }) => `Marked unknown. Next: ${await nextFrom(await api.markUnknown(fieldKey))}`),
      }),
      confirm: llm.tool({
        description: 'The person said yes to your read-back of a critical answer.',
        parameters: z.object({ fieldKey: z.string() }),
        execute: gated(async ({ fieldKey }, turn) => {
          const res = await api.confirm(fieldKey, await heard.latest(), responseId('confirm', fieldKey, turn));
          const next = await nextFrom(res);
          if (res.confirmed === false) return res.skipped
            ? `Not confirmed; a person will check it later. Do not ask again. Next: ${next}`
            : `No clear confirmation received. Do not claim it was confirmed. Next: ${next}`;
          return `Confirmed. Next: ${next}`;
        }),
      }),
      disclose: llm.tool({
        description: 'Call once, after delivering the AI disclosure and the person agrees to continue.',
        execute: gated(async () => `Disclosed. Next: ${await nextFrom(await api.disclose())}`),
      }),
      request_human: llm.tool({
        description: 'The person asked to speak to a human / a real person / a team member.',
        execute: guarded(async () => { await nextFrom(await api.requestCallback(null, 'Asked to speak to a person', true)); return 'Tell them a team member will contact them, say goodbye, then call finish_call.'; }),
      }),
      request_callback: llm.tool({
        description: 'The person asked to be called back. Capture the time and any note.',
        parameters: z.object({ when: z.string().optional(), note: z.string().optional() }),
        execute: guarded(async ({ when, note }) => { await nextFrom(await api.requestCallback(when || null, note || null)); return 'Acknowledge the callback, say goodbye, then call finish_call.'; }),
      }),
      do_not_contact: llm.tool({
        description: 'The person asked to stop being called. Stop asking questions.',
        execute: guarded(async () => { await nextFrom(await api.doNotContact()); return 'Apologise, confirm they will not be called again, say goodbye, then call finish_call.'; }),
      }),
      decline: llm.tool({
        description: 'The person declined to participate in the questionnaire.',
        execute: guarded(async () => { await nextFrom(await api.decline()); return 'Thank them for their time, say goodbye, then call finish_call.'; }),
      }),
      // Only when the agent has transfer targets configured in the CRM (see humanTransfer.js).
      ...(context.transfer?.enabled ? { request_human_transfer: llm.tool({
        description: 'Transfer the call to a human team member: the person asked for a human, or needs a price, deal or commitment that is not in the approved knowledge. Give a short reason and a factual summary of the call so far.',
        parameters: z.object({ reason: z.string().max(500), summary: z.string().max(2000) }),
        execute: guarded(async ({ reason, summary }) => {
          const res = await transfer.request({ reason, summary });
          if (res.watch) {
            void transfer.watch({
              say: async (instructions) => { session.generateReply({ instructions }); await waitUntilQuiet(session, () => agentState, { minMs: 1200 }); },
              waitForHuman: (ms) => waitForHumanParticipant(ctx.room, ms),
              handOff: async (mode) => {
                silenceWatchdog?.stop();
                log('call handed to a person', { callId, mode });
                if (mode !== 'web') return; // phone: the SIP leg leaves the room; the disconnect handler ends the call
                ctx.room.on?.('participantDisconnected', (p) => { if (String(p?.identity || '').startsWith('human-')) finish(null, 0); });
                await session.close().catch((e) => warn('closing the AI session after handover failed', { callId, error: e?.message }));
              },
              fallback: (instructions) => { gate.reset(); silenceWatchdog?.arm(); session.generateReply({ instructions }); },
            }).catch((e) => warn('transfer watch failed', { callId, error: e?.message }));
          }
          return res.instruction;
        }),
      }) } : {}),
      reached_voicemail: llm.tool({
        description: 'You reached an answering machine / voicemail greeting, not a person. Do NOT leave a message.',
        execute: async () => { await finish('voicemail', 200); return undefined; },
      }),
      finish_call: llm.tool({
        description: 'End the call after the closing line and automatically save private call description, summary, and blockers to the CRM.',
        parameters: z.object({
          description: z.string().max(2000),
          summary: z.string().max(4000),
          blockers: z.array(z.string().max(500)).max(10),
          lead_tone: z.enum(['positive', 'neutral', 'hesitant', 'negative']).optional(),
          tone_evidence: z.string().max(300).optional(),
        }),
        // No return value → agents-js generates no follow-up reply (anything returned would be spoken).
        execute: async (notes) => { if (!['finish', 'end'].includes(pendingAction?.type)) return `Do not end yet. Complete the current step: ${pending}`; const { lead_tone: tone, tone_evidence: evidence, ...rest } = notes; callNotes = { ...rest, ...(tone ? { behavior: { tone, evidence: evidence || '' } } : {}) }; finish(null); return undefined; },
      }),
    };

    agent = new voice.Agent({ instructions: withCurrentStep(baseInstructions, pending), tools });

    session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: callModel,
        voice: meta.voice || config.voice || process.env.OPENAI_REALTIME_VOICE || 'alloy',
        apiKey: process.env.OPENAI_API_KEY,
        turnDetection: turnDetection(),
        inputAudioTranscription: transcription(meta.language || config.language, process.env, context.transcriptionContext),
        ...(isPstn ? {} : { inputAudioNoiseReduction: { type: 'near_field' } }),
      }),
      // Campaign config: silence → "away" after N seconds; barge-in on/off.
      userAwayTimeout: Math.max(2, Number(config.silenceTimeoutSeconds) || 8),
      turnHandling: { interruption: { enabled: config.allowBargeIn !== false } },
    });

    const publishActivity = (speaker) => api.activity(agentState, speaker).catch(e => warn('activity upload failed', { callId, error: e?.message }));
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      agentState = ev.newState;
      void publishActivity(agentState === 'speaking' ? 'assistant' : null);
    });

    let userSpeaking = false;
    let opened = false;
    let introRepeats = 0;
    silenceWatchdog = createSilenceWatchdog({
      timeoutMs: Math.max(2, Number(config.silenceTimeoutSeconds) || 8) * 1000,
      isBusy: () => !opened || userSpeaking || gate.busy() || transfer.holding() || ['initializing', 'thinking', 'speaking'].includes(agentState),
      warn: error => warn('question silence retry failed', { callId, error: error?.message }),
      onSilence: async () => {
        quality.onSilence();
        if (pendingAction?.type === 'disclose') {
          introRepeats += 1;
          if (introRepeats > 3) { session.generateReply({ instructions: 'No agreement was received. Say a brief polite goodbye without collecting any information.' }); await finish(null, 3000); return; }
        } else if (['ask', 'clarify', 'confirm'].includes(pendingAction?.type)) {
          try { await nextFrom(await api.noResponse(pendingAction.question.fieldKey, 'silence')); }
          catch (error) { await nextFrom(await api.context()); throw error; }
        } else if (['finish', 'end'].includes(pendingAction?.type)) { await finish(null, 1000); return; }
        if (userSpeaking || ['thinking', 'speaking'].includes(agentState)) return;
        gate.reset();
        session.generateReply({ instructions: `The caller has not provided an answer. Do not assume one. ${pending}` });
      },
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, () => {
      if (['thinking', 'speaking', 'initializing'].includes(agentState)) silenceWatchdog.cancel();
      else if (opened) silenceWatchdog.arm();
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, ev => {
      userSpeaking = ev.newState === 'speaking';
      if (userSpeaking) silenceWatchdog.cancel();
      else if (opened && ev.newState === 'listening') silenceWatchdog.arm();
    });
    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => { usage = ev.usage; });
    attachQualityTelemetry({ session, room: ctx.room, quality, events: voice.AgentSessionEventTypes });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState === 'speaking') { heard.onSpeaking(); void publishActivity('customer'); }
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => { if (ev.isFinal) heard.onTranscript(ev.transcript); });
    // Publish both sides as speech finishes; never block the voice model on uploads.
    if (context.persistTranscript !== false) {
      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => transcripts.add(ev?.item));
    }
    const failRealtime = (error) => explainRealtimeFailure(error, { apiKey: process.env.OPENAI_API_KEY, model: realtimeModel() })
      .then((reason) => fail(reason));
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      const error = ev?.error;
      warn('session error', { callId, recoverable: error?.recoverable, error: String(error?.error?.message || error?.message || error || '') });
      // Unrecoverable (bad key, no credit, OpenAI unreachable after retries): the session is
      // closing, so the call cannot continue. Recoverable errors are retried by agents-js.
      if (error?.recoverable === false) failRealtime(error);
    });

    try {
      await session.start({ agent, room: ctx.room, inputOptions: { participantIdentity: context.participantIdentity || (isPstn ? `sip-${callId}` : undefined) } });
    } catch (error) {
      await failRealtime(error);
      return;
    }
    if (failed) return;

    // ---- Browser calls: the realtime session is already connected while the
    // customer's browser joins; nobody to talk to until it has.
    if (!isPstn) {
      const joined = await Promise.race([
        ctx.waitForParticipant(context.participantIdentity).then(() => true),
        new Promise((resolve) => { setTimeout(() => resolve(false), RING_TIMEOUT_MS); }),
        failedPromise.then(() => null),
      ]);
      if (joined === null) return; // fail() reports and hangs up
      if (!joined) {
        log('browser participant never joined', { callId });
        await finish(null, 0);
        return;
      }
      answeredAt = Date.now();
      await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));
    }

    if (failed) return;
    // Kick off: tell the model to deliver the disclosure / first action. On a phone call,
    // let the callee's "Hello?" finish first (see openCall in callControl.js).
    const opener = () => {
      opened = true; silenceWatchdog.arm();
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
    const guard = setTimeout(() => { if (transfer.handedOff()) return; log('max call duration reached', { callId }); finish(null, 0); }, maxMs);

    // The callee hung up, or the room closed: finish whatever was collected.
    ctx.room.on?.('participantDisconnected', (p) => {
      const caller = context.participantIdentity ? p?.identity === context.participantIdentity : isPstn ? p?.identity === `sip-${callId}` : !String(p?.identity || '').startsWith('agent-') && !String(p?.identity || '').startsWith('monitor-');
      if (caller) { clearTimeout(guard); finish(null, 0); }
    });
    ctx.room.on?.('disconnected', () => { clearTimeout(guard); endCall(null); });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Say at startup when calls are bound to fail (expired key, no such model), not per call.
  if (['start', 'dev'].includes(process.argv[2])) {
    probeOpenAI({ apiKey: process.env.OPENAI_API_KEY, model: realtimeModel() })
      .then((problem) => { if (problem) warn(`OpenAI check failed: ${problem.message}`, { code: problem.code }); });
  }
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'crm-voice-agent',
    // Pre-started job processes make a call start ~1 s faster (production default: up to 4).
    ...(process.env.AGENT_IDLE_PROCESSES ? { numIdleProcesses: Number(process.env.AGENT_IDLE_PROCESSES) } : {}),
    // Health-check port (LiveKit's production default is 8081, which clashes with Metro locally).
    ...(process.env.AGENT_HEALTH_PORT ? { port: Number(process.env.AGENT_HEALTH_PORT) } : {}),
  }));
}
