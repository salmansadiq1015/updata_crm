import { createEmailTools } from './emailTools.js';
import { createLanguageUpdater } from './sessionLanguage.js';
import { createBehaviorPublisher } from './behaviorPublisher.js';
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
import { LiveKitVoiceAdapter, providerErrorCode } from './providers/livekitAdapters.js';
import { establishProvider } from './providers/providerManager.js';
import { voiceProviderConfig } from '../../shared/voiceProviderConfig.js';
import { computeCallCost } from '../../shared/voiceCost.js';
import { ToolApi, actionToInstruction, answerResultInstruction } from './toolApi.js';
import { createTranscriptPublisher } from './transcriptPublisher.js';
import { randomUUID, createHash } from 'node:crypto';
import { createSilenceWatchdog } from './silenceWatchdog.js';
import { createQualityTelemetry, attachQualityTelemetry } from './qualityTelemetry.js';
import {
  AGENT_ERROR_ATTRIBUTE, crmUnreachable,
} from './failures.js';
import {
  waitForSipAnswer, once, waitUntilQuiet, createHeard, createAnswerGate, openCall,
} from './callControl.js';
import { createHumanTransfer, waitForHumanParticipant } from './humanTransfer.js';
import { turnDetection } from './transcription.js';
import { billingUsage } from './billingUsage.js';
import { contextOptions, createContextBudget, compactItems } from './contextManagement.js';
import { createResponseUsage } from './responseUsage.js';
import { closeVoiceSession } from './sessionCleanup.js';
import { isInbound, createInboundTools, inboundInstructions, INBOUND_FIRST_STEP } from './inbound.js';
export { transcription, turnDetection } from './transcription.js';

const safeJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const log = (msg, extra = {}) => console.log(JSON.stringify({ level: 'info', msg: `[voice-agent] ${msg}`, ...extra }));
const warn = (msg, extra = {}) => console.warn(JSON.stringify({ level: 'warn', msg: `[voice-agent] ${msg}`, ...extra }));
const RING_TIMEOUT_MS = Number(process.env.AGENT_RING_TIMEOUT_MS || 60_000);
// How long a failed browser call waits for the tester to join, so they can read why.
const FAILURE_NOTICE_WAIT_MS = 15_000;

export default defineAgent({
  entry: async (ctx) => {
    const startedAt = Date.now();
    let callModel = null;
    let activeProvider = null;
    let selection = null;
    let providerConfig = null;
    const limits = contextOptions();
    const budget = createContextBudget(limits);
    let responseUsage = createResponseUsage({ model: callModel });
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
    const recordProviderAttempt = attempt => api.providerAttempt({ ...attempt, sessionId: ctx.room?.name || meta.roomName || callId });
    const transcripts = createTranscriptPublisher(api, { warn: (message, extra) => warn(message, { callId, ...extra }) });
    const behaviorEvents = createBehaviorPublisher(api, { warn: (message, extra) => warn(message, { callId, ...extra }) });
    let session = null;
    let ending = false;
    let guard = null;
    let languageUpload = Promise.resolve();
    const flushTranscripts = async (timeoutMs = 3000) => {
      for (const item of (session?.history?.items || []).slice(-100)) transcripts.add(item);
      await transcripts.flush(timeoutMs);
    };
    const hangUp = once(() => ctx.deleteRoom().catch((e) => warn('deleteRoom failed', { callId, error: e?.message })));

    let silenceWatchdog = null;
    let answeredAt = null;
    let usage = null;
    let inputDiagnostics = {};
    let callNotes = null;
    const quality = createQualityTelemetry({ vadSilenceMs: turnDetection().silence_duration_ms ?? null });
    // /end is sent exactly once, whichever path ends the call first.
    const endCall = once(async (disposition = null, reason = null) => {
      ending = true;
      clearTimeout(guard);
      silenceWatchdog?.stop();
      const durationSeconds = answeredAt ? Math.round((Date.now() - answeredAt) / 1000) : 0;
      // Stop capture/generation before network uploads and the final usage snapshot.
      const closedUsage = await closeVoiceSession(session, flushTranscripts, e => warn('session close failed', { callId, error: e?.message }));
      await selection?.adapter.terminateSession().catch(() => {});
      let languageFlushTimer;
      try { await Promise.race([languageUpload, new Promise(resolve => { languageFlushTimer = setTimeout(resolve, 3000); })]); }
      finally { clearTimeout(languageFlushTimer); }
      const pendingBehavior = await behaviorEvents.flush();
      if (pendingBehavior.remaining) warn('call ended with undelivered behavior events', { callId, remaining: pendingBehavior.remaining });
      behaviorEvents.stop();
      // SDK usage is a cumulative session snapshot, not another usage event to add.
      const finalUsage = billingUsage(closedUsage || usage, { model: callModel, provider: activeProvider || 'unknown' });
      if (finalUsage) finalUsage.responseTelemetry = { ...responseUsage.snapshot(), configuration: {
        version: 'multi-provider-v1', provider: activeProvider, model: callModel, voice: activeProvider === 'gemini' ? providerConfig?.geminiVoice : meta.voice || context?.agentConfig?.voice || process.env.OPENAI_REALTIME_VOICE || 'alloy',
        language: meta.language || context?.agentConfig?.language || 'en',
        allowBargeIn: context?.agentConfig?.allowBargeIn !== false,
        turnDetection: activeProvider === 'gemini' ? { type: 'gemini_automatic_vad', silenceDurationMs: 1000 } : turnDetection(process.env, { allowBargeIn: context?.agentConfig?.allowBargeIn !== false }),
        questionnaireFingerprint: context?.questionnaireFingerprint || null,
        ...limits, ...inputDiagnostics,
      } };
      await api.end({
        disposition,
        durationSeconds,
        ...(callNotes ? { callNotes } : {}),
        roomName: ctx.room?.name || meta.roomName || null,
        cost: { amount: 0, currency: 'USD', breakdown: { ...(finalUsage ? { usage: finalUsage } : {}), aiVoice: selection ? { provider: activeProvider, model: callModel, fallback: selection.fallback, attempts: selection.attempts } : null } },
        quality: (answeredAt && quality.markAnswered(), quality.summary(session?.history?.items)),
        ...(reason ? { failureCode: reason.code, failureMessage: reason.message.slice(0, 500) } : {}),
      }).catch((e) => warn('end tool call failed (the CRM reconciler will finish the call)', { callId, error: e?.message }));
    });
    ctx.addShutdownCallback?.(() => endCall(null));

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
    context = loaded.value.value;
    try {
      providerConfig = { ...voiceProviderConfig(context.voiceProviders || {}), sealedCredentials: context.voiceProviders?.sealedCredentials || {} };
      if (context.voiceProviders?.selectedGeminiModel === 'gemini-3.1-flash-live-preview' && context.voiceProviders?.experimentalModel === 'gemini-3.1-flash-live-preview') providerConfig.selectedGeminiModel = context.voiceProviders.selectedGeminiModel;
    }
    catch { await fail({ code: 'VOICE_CONFIG_INVALID', message: 'The voice provider configuration is invalid. Review AI Provider Configuration.' }); return; }
    log('call ready', { callId, roomJoinMs: joinedRoom.value.ms, contextMs: loaded.value.ms });
    // Incoming phone call: the caller is already waiting on the line. Connect the voice provider
    // BEFORE the gateway answers and only then report ready, so the greeting starts the moment the
    // call audio opens (otherwise the caller hears seconds of silence after the answer).
    const prestartInbound = isPstn && isInbound(meta, context);
    // A gateway must not dial while the worker is still loading its call context.
    if (!prestartInbound) await ctx.room.localParticipant.setAttributes({ 'updata.agent_ready': 'true' });

    // ---- Wait for a real answer before saying anything (PSTN only).
    if (isPstn && !prestartInbound) {
      const result = await waitForSipAnswer(ctx.room, `sip-${callId}`, RING_TIMEOUT_MS);
      if (result !== 'answered') {
        log('call not answered', { callId, result });
        await endCall('no_answer');
        await hangUp();
        return;
      }
    }
    if (isPstn && !prestartInbound) {
      answeredAt = Date.now();
      await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));
      log('customer joined; realtime session ready', { callId, ms: Date.now() - startedAt });
    }

    const config = context.agentConfig || {};
    // Incoming call: the caller rang us. Receptionist mode (free conversation + silent capture tools).
    const inboundCall = isInbound(meta, context);
    let currentLanguage = context.conversationLanguage?.current || config.language;
    const baseInstructions = inboundCall ? inboundInstructions(context) : [
      context.systemPrompt,
      `Disclosure to deliver first in the conversation language (translate faithfully; preserve the AI identity, company and consent request): "${context.disclosure}"`,
      'If you hear an automated voicemail greeting instead of a person, call reached_voicemail immediately and say nothing.',
      'When calling finish_call, include private CRM notes: a brief description of the conversation, a factual summary of the lead responses and next steps, and blockers explicitly raised by the lead. Use an empty blockers list if none were stated. Never infer objections or commitments. Also give the overall tone of the lead (positive, neutral, hesitant or negative) judged only from what they said, with a short quote or paraphrase as evidence; use neutral when unclear. These notes are not spoken aloud.',
      context.dynamicLeadInstruction,
    ].filter(Boolean).join('\n\n');
    inputDiagnostics = { instructionCharacters: baseInstructions.length,
      instructionFingerprint: createHash('sha256').update(baseInstructions).digest('hex'),
      dynamicLeadCharacters: context.dynamicLeadInstruction?.length || 0 };
    let pendingAction = context.nextAction;
    let pending = inboundCall ? INBOUND_FIRST_STEP : actionToInstruction(pendingAction);
    let agent = null;
    const applyLanguage = createLanguageUpdater({ revision: context.languageRevision || 0, update: async language => {
      if (ending || currentLanguage === language) return;
      await agent.updateInstructions(`${baseInstructions}\nAUTHORITATIVE CURRENT CALL LANGUAGE: ${language}. Continue the pending question without restarting.`);
      currentLanguage = language;
    } });
    // Tool results carry the next step. Never rewrite the session prefix per answer.
    const nextFrom = async (res) => {
      silenceWatchdog?.cancel();
      pendingAction = res.nextAction;
      pending = actionToInstruction(pendingAction);
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
    const speechSession = randomUUID();
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

    const closeSilentCall = async reason => {
      silenceWatchdog?.stop();
      const goodbye = session.generateReply({ instructions: `Speak only in ${currentLanguage}. ${reason} Give one brief polite goodbye. Do not ask another question.`, toolChoice: 'none', allowInterruptions: false });
      let timer;
      try { await Promise.race([goodbye.waitForPlayout(), new Promise(resolve => { timer = setTimeout(resolve, 12000); })]); }
      catch (error) { warn('closing speech could not finish', { callId, error: error?.message }); }
      finally { clearTimeout(timer); }
      await finish(null, 0);
    };

    // ---- the constrained tool set the model may call (keys become tool names) ----
    const tools = {
      report_language: llm.tool({
        description: 'Report language heard in the lead audio or an explicit language request. Use BCP-47 language codes; Moroccan Darija is ar-MA. Use full linguistic phrases, not a borrowed word or name. The CRM decides the current language; continue the same pending question in the returned language.',
        parameters: z.object({ language: z.string().max(10), explicit: z.boolean(), confidence: z.number().min(0).max(1) }),
        execute: guarded(async ({ language, explicit, confidence }) => {
          const evidence = await heard.latest();
          if (!evidence?.trim()) return `No lead speech evidence available. Continue in ${currentLanguage}.`;
          const result = await api.language({ language, explicit, confidence, evidence: evidence.slice(0, 1000), turnId: `${speechSession}:${heard.turns()}`, requestId: responseId(explicit ? 'language-explicit' : 'language', language, heard.turns()) });
          await applyLanguage(result);
          if (explicit) gate.advance(); // A language request cannot complete the pending question.
          return `Current language: ${currentLanguage}. Continue the same pending step without restarting: ${pending}`;
        }),
      }),
      record_engagement: llm.tool({
        description: 'Record observable lead behavior only when explicitly spoken. Supply no personality or emotion judgments.',
        parameters: z.object({ type: z.enum(['lead_question', 'information_requested', 'interest_expressed']) }),
        execute: guarded(async ({ type }) => {
          const evidence = await heard.latest();
          if (!evidence?.trim()) return 'No speech evidence available.';
          behaviorEvents.add({ id: responseId(type, '', heard.turns()), type, evidence: evidence.slice(0, 1000) });
          return `Continue the pending question: ${pending}`;
        }),
      }),
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
        parameters: z.object({ fieldKey: z.string(), reason: z.enum(['unrelated', 'unintelligible', 'partial', 'clarification']) }),
        execute: gated(async ({ fieldKey, reason }, turn) => {
          return `No answer recorded. Next: ${await nextFrom(await api.noResponse(fieldKey, reason, responseId('no-response', fieldKey, turn), (await heard.latest())?.slice(0, 4000) || null))}`;
        }),
      }),
      mark_answer_unknown: llm.tool({
        description: 'The person explicitly said they do not know, prefer not to share, or want to skip this question. Never use this for unrelated, incomplete or unintelligible replies.',
        parameters: z.object({ fieldKey: z.string(), reason: z.enum(['unknown', 'refused']).default('unknown') }),
        execute: gated(async ({ fieldKey, reason }) => `Marked unknown. Next: ${await nextFrom(await api.markUnknown(fieldKey, reason, (await heard.latest())?.slice(0, 1000) || null))}`),
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

    if (inboundCall) {
      // Keep the shared language tool; replace the questionnaire tools with the receptionist set.
      for (const name of Object.keys(tools)) if (name !== 'report_language') delete tools[name];
      Object.assign(tools, createInboundTools({
        llm, z, api, guarded, heard, finish,
        setNotes: (notes) => { callNotes = notes; },
        requestIds: (kind, text) => responseId(kind, String(text).slice(0, 60), heard.turns()),
      }));
    }

    const initialContext = new llm.ChatContext();
    if (!inboundCall) Object.assign(tools, createEmailTools({ llm, api, guarded }));
    const toolSchema = JSON.stringify(Object.entries(tools).map(([name, t]) => ({ name, description: t.description, parameters: llm.toJsonSchema(t.parameters) })));
    inputDiagnostics.toolSchemaCharacters = toolSchema.length;
    inputDiagnostics.toolSchemaFingerprint = createHash('sha256').update(toolSchema).digest('hex');
    initialContext.addMessage({ role: 'developer', id: 'updata_initial_step', content: `Initial CRM state: ${JSON.stringify(context.conversationMemory || {})}\nInitial step (until the first tool result): ${pending}` });
    agent = new voice.Agent({ instructions: baseInstructions, chatCtx: initialContext, tools });

    // Avoid idle provider sessions while waiting for a browser participant.
    if (!isPstn) {
      const joined = await Promise.race([
        ctx.waitForParticipant(context.participantIdentity).then(() => true),
        new Promise(resolve => { const timer = setTimeout(() => resolve(false), RING_TIMEOUT_MS); timer.unref?.(); }),
        failedPromise.then(() => null),
      ]);
      if (joined === null) return;
      if (!joined) { await finish(null, 0); return; }
      answeredAt = Date.now();
      await api.answered().catch(e => warn('answered tool call failed', { callId, error: e?.message }));
    }
    try {
      selection = await establishProvider({ config: providerConfig,
        deadlineAt: (answeredAt || Date.now()) + Math.min(Number(config.maxCallSeconds) || 300, providerConfig.maxSessionSeconds) * 1000,
        createAdapter: candidate => new LiveKitVoiceAdapter({ ...candidate, config: providerConfig, instructions: baseInstructions, tools, chatCtx: initialContext, callConfig: config, meta, isPstn, maxOutputTokens: limits.maxResponseOutputTokens, transcriptionContext: context.transcriptionContext }),
        onAttempt: recordProviderAttempt,
      });
      activeProvider = selection.provider; callModel = selection.model;
      log('realtime input configuration', { callId, provider: activeProvider, model: callModel, ...inputDiagnostics, ...limits });
      responseUsage = createResponseUsage({ model: callModel, provider: activeProvider });
    } catch (error) {
      await fail({ code: error.code || 'VOICE_PROVIDERS_UNAVAILABLE', message: 'Voice providers could not establish a session. Check provider credentials, model access, limits and worker connectivity.' }); return;
    }

    session = new voice.AgentSession({
      llm: selection.adapter.livekitModel,
      // Campaign config: silence → "away" after N seconds; barge-in on/off.
      userAwayTimeout: Math.max(2, Number(config.silenceTimeoutSeconds) || 10),
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
    let speechEpoch = 0;
    const behavior = payload => behaviorEvents.add(payload);
    let silenceEvent = null;
    silenceWatchdog = createSilenceWatchdog({
      timeoutMs: Math.max(2, Number(config.silenceTimeoutSeconds) || 10) * 1000,
      repetitionDelayMs: (config.repetitionDelaySeconds ?? 3) * 1000,
      onDetected: () => { silenceEvent = behavior({ type: 'silence' }); },
      isBusy: () => ending || !opened || userSpeaking || gate.busy() || transfer.holding() || ['initializing', 'thinking', 'speaking'].includes(agentState),
      warn: error => warn('question silence retry failed', { callId, error: error?.message }),
      onSilence: async () => {
        const silenceEpoch = speechEpoch;
        quality.onSilence();
        if (inboundCall) {
          introRepeats += 1;
          if (introRepeats > (config.maxRepetitionAttempts ?? 3)) {
            if (config.automaticCallTermination !== false) await closeSilentCall('The caller has stayed silent.');
            return;
          }
          if (ending || speechEpoch !== silenceEpoch || userSpeaking || ['thinking', 'speaking'].includes(agentState)) return;
          session.generateReply({ instructions: `Speak only in ${currentLanguage}. The caller is silent. Briefly check whether they are still there or need anything else. Do not repeat the greeting.` });
          return;
        }
        if (pendingAction?.type === 'disclose') {
          introRepeats += 1;
          if (introRepeats > (config.maxRepetitionAttempts ?? 3)) {
            if (config.automaticCallTermination !== false) await closeSilentCall('No agreement to participate was received.');
            return;
          }
        } else if (['ask', 'clarify', 'confirm'].includes(pendingAction?.type)) {
          try { await nextFrom(await api.noResponse(pendingAction.question.fieldKey, 'silence', randomUUID(), null, silenceEvent)); }
          catch (error) { await nextFrom(await api.context()); throw error; }
        } else if (['finish', 'end'].includes(pendingAction?.type)) { await finish(null, 1000); return; }
        if (ending || speechEpoch !== silenceEpoch || userSpeaking || ['thinking', 'speaking'].includes(agentState)) return;
        if (pendingAction?.type === 'end') { await closeSilentCall('The configured unanswered-question limit was reached.'); return; }
        gate.reset();
        session.generateReply({ instructions: `Current language: ${currentLanguage}. The caller has not provided an answer. Do not assume one. ${pending}` });
      },
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, ev => {
      if (opened && ev.oldState === 'speaking' && ev.newState === 'listening' && pendingAction?.question) void behavior({ type: 'question_waiting', fieldKey: pendingAction.question.fieldKey });
      if (['thinking', 'speaking', 'initializing'].includes(agentState)) silenceWatchdog.cancel();
      else if (opened) silenceWatchdog.arm();
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, ev => {
      userSpeaking = ev.newState === 'speaking';
      if (userSpeaking) {
        speechEpoch += 1; silenceWatchdog.cancel();
        if (inboundCall) introRepeats = 0;
        void behavior({ type: 'response_started' });
        if (agentState === 'speaking') void behavior({ type: 'interruption' });
      }
      else if (opened && ev.newState === 'listening') silenceWatchdog.arm();
    });
    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => {
      usage = ev.usage;
      if (providerConfig.maxCallCostUsd > 0 && !ending) {
        const cost = computeCallCost({ usage: billingUsage(usage, { model: callModel, provider: activeProvider }) }, { ...process.env, AI_CALLING_MODEL_PRICING: JSON.stringify(context.voiceProviders?.modelPricing || {}) });
        if (cost.breakdown.unpriced || cost.amount >= providerConfig.maxCallCostUsd) void finish(null, 0);
      }
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected, ev => {
      if (responseUsage.observe(ev?.metrics)) budget.observe(ev.metrics);
    });
    let compacting = false;
    const archivedStatements = new Map();
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, async ev => {
      // Gemini Live cannot delete history items; use supported server compression.
      if (activeProvider !== 'openai' || ev.newState !== 'listening' || ending || compacting || gate.busy() || userSpeaking || !budget.due() || agent.chatCtx.items.length < limits.recentItems * 2) return;
      compacting = true;
      try {
        const fresh = await api.context();
        if (ending || userSpeaking || gate.busy() || agentState !== 'listening') return;
        const compacted = compactItems(agent.chatCtx.items, fresh.conversationMemory, actionToInstruction(fresh.nextAction), limits.recentItems, archivedStatements);
        if (!compacted) return;
        await flushTranscripts();
        if (ending || userSpeaking || agentState !== 'listening') return;
        const chat = new llm.ChatContext();
        chat.addMessage({ role: 'developer', id: 'updata_context_checkpoint', content: compacted.checkpoint, createdAt: compacted.recent[0].createdAt - 1 });
        chat.items.push(...compacted.recent);
        await agent.updateChatCtx(chat);
        budget.compacted(); responseUsage.compacted();
        log('context compacted', { callId, removedItems: compacted.removed, retainedItems: compacted.recent.length });
      } catch (error) { warn('context compaction deferred', { callId, error: error?.message }); }
      finally { compacting = false; }
    });
    attachQualityTelemetry({ session, room: ctx.room, quality, events: voice.AgentSessionEventTypes });
    ctx.room.on?.('reconnected', () => responseUsage.reconnected());
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState === 'speaking') { heard.onSpeaking(); void publishActivity('customer'); }
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.isFinal) return;
      heard.onTranscript(ev.transcript);
      if (!ev.language || config.automaticLanguageDetection === false || !ev.transcript?.trim()) return;
      const turn = heard.turns();
      const evidence = ev.transcript.slice(0, 1000);
      languageUpload = languageUpload.then(async () => {
        const result = await api.language({ language: ev.language, explicit: false, source: 'asr', evidence,
          turnId: `${speechSession}:${turn}`, requestId: responseId('language', ev.language, turn) });
        await applyLanguage(result);
      }).catch(error => warn('language evidence upload failed', { callId, error: error?.message }));
    });
    // Publish both sides as speech finishes; never block the voice model on uploads.
    if (context.persistTranscript !== false) {
      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => transcripts.add(ev?.item));
    }
    const failRealtime = async error => {
      if (ending) return;
      const code = providerErrorCode(error);
      await recordProviderAttempt({ provider: activeProvider, model: callModel, status: 'runtime_error', reason: code, at: new Date().toISOString(), latencyMs: 0 }).catch(() => {});
      await fail({ code: `${activeProvider.toUpperCase()}_${code}`, message: `${activeProvider} voice session failed. Collected answers remain saved. No mid-call provider switch was attempted.` });
    };
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      const error = ev?.error;
      warn('session error', { callId, provider: activeProvider, recoverable: error?.recoverable, code: providerErrorCode(error) });
      // Unrecoverable (bad key, no credit, OpenAI unreachable after retries): the session is
      // closing, so the call cannot continue. Recoverable errors are retried by agents-js.
      if (error?.recoverable === false) failRealtime(error);
    });
    if (selection.adapter.fatalError) { await failRealtime(selection.adapter.fatalError); return; }

    try {
      await session.start({ agent, room: ctx.room, inputOptions: { participantIdentity: context.participantIdentity || (isPstn ? `sip-${callId}` : undefined) } });
    } catch (error) {
      await failRealtime(error);
      return;
    }
    if (failed) return;
    if (prestartInbound) {
      await ctx.room.localParticipant.setAttributes({ 'updata.agent_ready': 'true' });
      log('incoming call: voice session ready before answer', { callId, ms: Date.now() - startedAt });
      const result = await waitForSipAnswer(ctx.room, `sip-${callId}`, RING_TIMEOUT_MS);
      if (result !== 'answered') {
        log('incoming call not answered by the gateway', { callId, result });
        await endCall('no_answer');
        await hangUp();
        return;
      }
      answeredAt = Date.now();
      await api.answered().catch((e) => warn('answered tool call failed', { callId, error: e?.message }));
    }
    // Kick off: tell the model to deliver the disclosure / first action. On a phone call,
    // let the callee's "Hello?" finish first (see openCall in callControl.js).
    const opener = () => {
      if (ending) return;
      opened = true; silenceWatchdog.arm();
      gate.reset(); // a "Hello?" before the disclosure is not agreement to continue
      return session.generateReply({ instructions: `Start the call now. ${pending}` });
    };
    if (isPstn && !inboundCall) {
      let userState = 'listening';
      session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => { userState = ev.newState; });
      openCall(session, { userState: () => userState, agentState: () => agentState, generate: opener })
        .then((result) => log('call opened', { callId, result, ms: Date.now() - answeredAt }));
    } else {
      opener();
    }

    // Max-duration guard (the CRM reconciler is the backstop if this process dies).
    const maxMs = Math.max(0, Math.min(Number(config.maxCallSeconds) || 300, providerConfig.maxSessionSeconds) * 1000 - (Date.now() - answeredAt));
    guard = setTimeout(() => { if (transfer.handedOff()) return; log('max call duration reached', { callId }); finish(null, 0); }, maxMs);

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
  cli.runApp(new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'crm-voice-agent',
    // Pre-started job processes make a call start ~1 s faster (production default: up to 4).
    ...(process.env.AGENT_IDLE_PROCESSES ? { numIdleProcesses: Number(process.env.AGENT_IDLE_PROCESSES) } : {}),
    // Health-check port (LiveKit's production default is 8081, which clashes with Metro locally).
    ...(process.env.AGENT_HEALTH_PORT ? { port: Number(process.env.AGENT_HEALTH_PORT) } : {}),
  }));
}
