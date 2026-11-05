/**
 * Incoming-call receptionist mode for the voice worker.
 *
 * Outbound calls run a questionnaire the CRM steps through; an incoming caller has their OWN
 * reason for calling. Here the model converses freely and saves, silently and as it goes:
 * caller details (with explicit/inferred provenance), every question the caller asks, the
 * call's intent, callback / human / do-not-contact requests — through the CRM's inbound tool API
 * (`/api/v1/inbound-calls/agent/:callId/*`). The CRM validates and owns everything.
 *
 * Pure tool/instruction builders so they are unit-tested without LiveKit.
 */

import { randomUUID } from 'node:crypto';

export const INBOUND_CATEGORIES = Object.freeze([
  'SALES_INQUIRY', 'PRODUCT_INQUIRY', 'SERVICE_INQUIRY', 'PRICING_INQUIRY', 'SUPPORT_REQUEST', 'TECHNICAL_SUPPORT',
  'APPOINTMENT_REQUEST', 'CALLBACK_REQUEST', 'COMPLAINT', 'GENERAL_INFORMATION', 'OTHER',
]);

export const isInbound = (meta = {}, context = {}) => meta.direction === 'inbound' || context.direction === 'inbound';

/** Extra API calls the inbound tool set needs (on top of ToolApi's shared ones). */
export function inboundApi(api) {
  return {
    callerInfo: (fields) => api._post('/caller-info', { fields }),
    callerQuestion: (q) => api._postEvent('/caller-question', q),
    intent: (primary, secondary = []) => api._post('/intent', { primary, secondary }),
    requestHuman: (reason, summary) => api._post('/request-human', { reason, summary }, 10_000),
    requestCallback: (when, note) => api._post('/request-callback', { when: when || null, note: note || null }),
    doNotContact: () => api._post('/do-not-contact'),
  };
}

export function inboundInstructions(context) {
  return [
    context.systemPrompt,
    `Your greeting (say it first, once, in the conversation language; do not add a question before it): "${context.greeting}"`,
    'When you call finish_call, include private CRM notes (never spoken): the reason for calling, a factual summary, the caller\'s requirements, concerns, objections, any question you could not answer, and their overall tone (positive, neutral, hesitant or negative) judged only from what they said, with a short quote as evidence. Set not_interested only if they explicitly said they are not interested.',
  ].filter(Boolean).join('\n\n');
}

export const INBOUND_FIRST_STEP = 'Greet the caller with your greeting and let them tell you why they are calling.';

/**
 * Build the inbound tool set.
 * @param {object} deps { llm, z, api (ToolApi), guarded, heard, finish, setNotes, onCallerTurnNeeded }
 */
export function createInboundTools({ llm, z, api, guarded, heard, finish, setNotes, requestIds = () => randomUUID() }) {
  const inbound = inboundApi(api);
  const needSpeech = async () => {
    const evidence = await heard.latest();
    return evidence && evidence.trim() ? evidence.slice(0, 1000) : null;
  };
  return {
    record_caller_info: llm.tool({
      description: 'Silently save details the caller gave about themselves or their request. Keys: full_name, email, company, job_title, location, website, preferred_contact_method, callback_phone, alternate_phone, address, city, postal_code, country, reason_for_call, service_interest, requirements, current_challenges, budget, timeline, decision_role, additional_requirements, callback_time, plus the closing-question keys in your instructions. explicit=false for anything you inferred rather than heard stated. declined=true (no value) when the caller does not want to answer that question.',
      parameters: z.object({
        fields: z.array(z.object({
          key: z.string(),
          value: z.string().default(''),
          explicit: z.boolean().default(true),
          declined: z.boolean().optional(),
          confidence: z.number().min(0).max(1).optional(),
          asked_question: z.string().optional(),
        })).min(1).max(12),
      }),
      execute: guarded(async ({ fields }) => {
        const evidence = await needSpeech();
        if (!evidence) return 'Nothing saved: the caller has not said anything yet. Listen first.';
        const res = await inbound.callerInfo(fields.map((f) => (f.declined ? { key: f.key, value: '', declined: true, evidence } : {
          key: f.key, value: f.value, explicit: f.explicit !== false, ...(Number.isFinite(f.confidence) ? { confidence: f.confidence } : {}),
          evidence, ...(f.asked_question ? { askedQuestion: f.asked_question } : {}),
        })));
        return res.instruction || 'Saved. Continue.';
      }),
    }),
    record_caller_question: llm.tool({
      description: 'Silently save a question the CALLER asked, its category, and whether you answered it from the approved knowledge (answered), partly (partially_answered), could not (unanswered) or promised a follow-up (deferred).',
      parameters: z.object({
        question: z.string(),
        category: z.enum(INBOUND_CATEGORIES),
        answer_status: z.enum(['answered', 'partially_answered', 'unanswered', 'deferred']),
        answer_summary: z.string().optional(),
      }),
      execute: guarded(async ({ question, category, answer_status: answerStatus, answer_summary: answerSummary }) => {
        await inbound.callerQuestion({ text: question, category, answerStatus, answerSummary: answerSummary || null, requestId: requestIds('question', question) });
        return 'Saved. Continue the conversation.';
      }),
    }),
    set_call_intent: llm.tool({
      description: 'Silently record why they are calling once it is clear (call again if it changes). primary = main purpose; secondary = other purposes raised.',
      parameters: z.object({ primary: z.enum(INBOUND_CATEGORIES), secondary: z.array(z.enum(INBOUND_CATEGORIES)).max(5).default([]) }),
      execute: guarded(async ({ primary, secondary }) => { await inbound.intent(primary, secondary || []); return 'Noted. Continue.'; }),
    }),
    request_callback: llm.tool({
      description: 'The caller wants to be called back. Capture the time exactly as they said it and any note.',
      parameters: z.object({ when: z.string().optional(), note: z.string().optional() }),
      execute: guarded(async ({ when, note }) => (await inbound.requestCallback(when, note)).instruction || 'Callback noted. Confirm it to them.'),
    }),
    request_human: llm.tool({
      description: 'The caller asked for a person, or the matter needs a decision-maker, or it is a serious complaint. Give a short reason and a factual summary so far. Call again later to check whether someone picked up.',
      parameters: z.object({ reason: z.string().max(500), summary: z.string().max(2000) }),
      execute: guarded(async ({ reason, summary }) => (await inbound.requestHuman(reason, summary)).instruction),
    }),
    do_not_contact: llm.tool({
      description: 'The caller asked not to be contacted again.',
      execute: guarded(async () => (await inbound.doNotContact()).instruction || 'Confirm and close politely.'),
    }),
    finish_call: llm.tool({
      description: 'End the call after your closing line. Saves private notes to the CRM (not spoken).',
      parameters: z.object({
        reason: z.string().max(1000),
        summary: z.string().max(4000),
        requirements: z.array(z.string().max(500)).max(10).default([]),
        concerns: z.array(z.string().max(500)).max(10).default([]),
        objections: z.array(z.string().max(500)).max(10).default([]),
        unresolved_questions: z.array(z.string().max(500)).max(10).default([]),
        caller_tone: z.enum(['positive', 'neutral', 'hesitant', 'negative']).optional(),
        tone_evidence: z.string().max(300).optional(),
        not_interested: z.boolean().optional(),
      }),
      // No return value: anything returned would be spoken.
      execute: async ({ caller_tone: tone, tone_evidence: evidence, ...notes }) => {
        setNotes({ ...notes, ...(tone ? { behavior: { tone, evidence: evidence || '' } } : {}) });
        finish(null);
        return undefined;
      },
    }),
  };
}
