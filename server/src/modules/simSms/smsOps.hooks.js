/**
 * One-line hooks the SIM SMS service calls into the SMS-operations features
 * (recovery inbox, multi-answer extraction + review, callbacks, insights).
 * Every hook is best-effort where noted: a recovery/insight failure must never
 * break message transport.
 */
import logger from '../../shared/logger/index.js';
import * as engine from '../aiCalling/engine/questionEngine.js';
import { recipientTimezone } from '../aiCalling/engine/callWindow.js';
import { extractAnswers, applyRecordedExtras } from './engine/multiAnswer.js';
import { conversationInsightsSummary } from './engine/smsInsights.js';
import recovery from './recovery.service.js';
import reviews from './smsAnswerReview.service.js';
import callbacks from './smsCallback.service.js';

const quiet = (label) => (error) => logger.warn(`sms-ops hook failed: ${label}`, { module: 'sim-sms', error: error?.message });

export const unknownSend = (message, code) => recovery.unknownSend(message, code).catch(quiet('unknown_send'));
export const deliveryFailure = (message, code) => recovery.deliveryFailure(message, code).catch(quiet('delivery_failure'));
export const crmSyncFailed = (conversation, error) => recovery.crmSyncFailed(conversation, error).catch(quiet('crm_sync_failed'));
export const crmSyncSucceeded = (conversationId) => recovery.crmSyncSucceeded(conversationId).catch(quiet('crm_sync_ok'));

/** linkAssistant did not match the reply either → keep it in the recovery inbox. */
export async function unmatchedInbound(actor, input, linkResult) {
  if (linkResult?.matched) return linkResult;
  await recovery.unmatchedReply(actor, input).catch(quiet('unmatched_reply'));
  return { ...(linkResult || {}), matched: false, retained: true };
}

/** Interpret a reply: open question + any other questions it answers + insights. */
export function interpret({ campaign, conversation, state, action, question, body, classify }) {
  const timezone = recipientTimezone(conversation.country) || campaign.settings?.timezone || 'UTC';
  return extractAnswers({ questionnaire: campaign.questionnaire, state, action, question, text: body, classify, timezone });
}

/** Stored on the inbound message (no raw values beyond what the transcript shows). */
export function interpretationRecord(extraction, question) {
  const p = extraction.primary;
  return {
    intent: p.intent, validation: p.validation, source: p.source, questionFieldKey: question?.fieldKey || null,
    extras: extraction.extras.map((e) => ({ fieldKey: e.fieldKey, value: e.value, confidence: e.confidence, decision: e.decision, reason: e.reason || null, source: e.source, evidence: e.evidence })),
    insights: extraction.insights,
  };
}

/** Engine state after recording the high-confidence extras (pure). */
export const withRecordedExtras = (state, extraction) => applyRecordedExtras(state, extraction?.extras, engine.applyAnswer);

/** The lead didn't answer the open question but answered others: just ask it again. */
export const answeredOthersOnly = (extraction) => extraction?.primary?.intent === 'unclear' && extraction.extras.some((e) => e.decision === 'record');

/** After the reply was applied: review queue + callback follow-up. */
export async function afterReply({ conversation, campaign, inbound, extraction, actor, endedByCallback = false }) {
  await reviews.queue({ conversation, campaign, inbound, extraction, actor }).catch(quiet('review_queue'));
  // A conversation that ENDS on a callback gets its follow-up from the CRM completion
  // (leadCommunication → follow-up inbox, with the parsed time); only notify here.
  await callbacks.handleReply({ conversation, campaign, inbound, insights: extraction.insights, actor, createFollowUp: !endedByCallback }).catch(quiet('callback'));
}

export const callbackTimezone = (conversation, campaign) => callbacks.timezoneFor(conversation, campaign);

export const conversationSummary = (messages) => conversationInsightsSummary(messages.filter((m) => m.direction === 'inbound'));
