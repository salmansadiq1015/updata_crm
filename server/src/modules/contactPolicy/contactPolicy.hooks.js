/**
 * One-line integration hooks for every outbound dispatch path. Each dispatcher
 * calls exactly one of these at its point of no return; all policy logic lives
 * here so the (shared) dispatcher files only gain a single line.
 *
 * Automated / campaign sends FAIL CLOSED: if the policy can't be evaluated
 * (database error) the send is deferred, never let through.
 */
import mongoose from 'mongoose';
import logger from '../../shared/logger/index.js';
import contactPolicyService from './contactPolicy.service.js';
import { COMMUNICATION_CHANNEL, HARD_BLOCK_REASONS } from './contactPolicy.constants.js';

const FAIL_CLOSED_DEFER_MS = 60_000;
const MAX_DEFER_MS = 7 * 24 * 3_600_000;

async function safeReserve(input) {
  try {
    return await contactPolicyService.reserve(input);
  } catch (error) {
    logger.warn('contact policy unavailable; send deferred (fail-closed)', { module: 'contact-policy', source: input.source, error: error.message });
    return { allowed: false, reason: 'contact_policy_unavailable', nextAllowedAt: new Date(Date.now() + FAIL_CLOSED_DEFER_MS), reservationId: null };
  }
}

const deferMsFor = (decision, now = Date.now()) => {
  const at = decision.nextAllowedAt ? new Date(decision.nextAllowedAt).getTime() : now + FAIL_CLOSED_DEFER_MS;
  return Math.min(MAX_DEFER_MS, Math.max(FAIL_CLOSED_DEFER_MS, at - now));
};
const isHardBlock = (reason) => HARD_BLOCK_REASONS.includes(reason);

/**
 * AI calling — called in _dispatchCall after the channel's own gates, before the
 * attempt is booked. Returns null (go ahead) or the dispatch result to return.
 */
// AI follow-up reasons where the LEAD asked for the next conversation ("call me in 10 minutes").
const LEAD_REQUESTED_FOLLOW_UP = new Set(['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'APPOINTMENT_PENDING']);

/**
 * A follow-up call the lead explicitly requested, or a person's deliberate "Call now"
 * (immediate run of a follow-up), is exempt from frequency / quiet-hours limits like a
 * SIM callback — never from hard blocks (do-not-contact, suppression, revoked consent).
 * Automatic retries (unreachable, incomplete answers) stay rate-limited.
 */
async function isRequestedFollowUp(campaign) {
  if (campaign.kind !== 'follow_up' || !campaign.followUpId) return false;
  if (campaign.runMode === 'immediate') return true;
  const { default: LeadFollowUp } = await import('../crm/leadFollowUp.model.js');
  const fu = await LeadFollowUp.findById(campaign.followUpId).select('automation.reason').lean();
  return LEAD_REQUESTED_FOLLOW_UP.has(fu?.automation?.reason);
}

export async function aiCallGate(service, campaign, recipient, { audioVerificationTest = false } = {}) {
  if (audioVerificationTest || campaign.isTest) return null;
  const decision = await safeReserve({
    leadId: recipient.leadId, channel: 'voice', campaignId: campaign._id, source: 'ai_calling',
    refId: `${recipient._id}:${(recipient.attemptCount || 0) + 1}`,
    force: await isRequestedFollowUp(campaign).catch(() => false),
  });
  if (decision.allowed) return null;
  const { default: CampaignRecipient } = await import('../aiCalling/campaignRecipient.model.js');
  const { refreshCampaignSummary } = await import('../aiCalling/aiCalling.service.js');
  if (isHardBlock(decision.reason)) {
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'suppressed', leaseUntil: null, 'eligibility.eligible': false, 'eligibility.reasons': [`contact_policy:${decision.reason}`] } });
    await refreshCampaignSummary(campaign._id);
    return { suppressed: true, reason: `contact_policy:${decision.reason}` };
  }
  await service._releaseClaim(recipient._id, { deferMs: deferMsFor(decision) });
  return { deferred: 'contact_policy', reason: decision.reason, nextAllowedAt: decision.nextAllowedAt };
}

// A callback the lead asked for is exempt from frequency/timing limits (never from DNC).
const isLeadCallback = (task) => Boolean(task.callback?.at && task.callback?.status === 'pending');

/** Undo a claim that was never dialled and push the lead back (or out). */
async function holdSimCallTask(task, attemptId, decision) {
  const { default: SimCallTask } = await import('../simCall/simCallTask.model.js');
  const unlock = { lock: { deviceId: null, attemptId: null, until: null } };
  const set = isHardBlock(decision.reason)
    ? { state: 'ineligible', eligibility: { eligible: false, reasons: [`CONTACT_POLICY_${decision.reason.toUpperCase()}`] }, ...unlock }
    : { state: isLeadCallback(task) ? 'scheduled' : 'pending', notBefore: new Date(Date.now() + deferMsFor(decision)), ...unlock };
  await SimCallTask.updateOne({ _id: task._id, state: 'in_progress', 'lock.attemptId': attemptId }, { $set: set, $pull: { attempts: { attemptId, dialedAt: null } } });
}

/**
 * SIM call — claimNext (after the lead passed its own eligibility): a lead over
 * its limit is put back (notBefore) so the phone isn't handed a lead it may not
 * dial. Returns true when the claim was undone (caller `continue`s).
 */
export async function simCallClaimHold(task, attemptId) {
  let decision;
  try {
    decision = await contactPolicyService.check({ leadId: task.leadId, channel: 'voice', campaignId: task.campaignId });
  } catch {
    decision = { allowed: false, reason: 'contact_policy_unavailable', nextAllowedAt: null };
  }
  if (decision.allowed || (isLeadCallback(task) && !isHardBlock(decision.reason))) return false;
  await holdSimCallTask(task, attemptId, decision);
  return true;
}

/**
 * SIM call — dial(): atomic reservation at the point the number is handed out.
 * Returns null (dial) or { message, details } after putting the lead back.
 */
export async function simCallDialGate(task, attemptId) {
  const decision = await safeReserve({
    leadId: task.leadId, channel: 'voice', campaignId: task.campaignId, source: 'sim_call', refId: `${task._id}:${attemptId}`,
    force: isLeadCallback(task),
  });
  if (decision.allowed) return null;
  await holdSimCallTask(task, attemptId, decision);
  return {
    message: 'Contact limit reached for this lead; it was not dialled and went back to the queue',
    details: { reasons: [`CONTACT_POLICY_${String(decision.reason).toUpperCase()}`], nextAllowedAt: decision.nextAllowedAt },
  };
}

// SIM SMS: only messages that START contact count as touches (opening, reminder).
// Replies inside a conversation the lead is actively answering are not limited.
export const SMS_TOUCH_KINDS = new Set(['opening', 'reminder']);

/** SIM SMS lease(): read-only check; returns null or { defer: ms, reason }. */
export async function simSmsLeaseCheck(message) {
  if (!SMS_TOUCH_KINDS.has(message.kind)) return null;
  try {
    const decision = await contactPolicyService.check({ leadId: message.leadId, channel: 'sms', campaignId: message.campaignId });
    if (decision.allowed) return null;
    // Hard blockers are the SMS gate's own business (smsBlockers); defer only limits.
    if (isHardBlock(decision.reason)) return null;
    return { defer: deferMsFor(decision), reason: decision.reason };
  } catch {
    return { defer: FAIL_CLOSED_DEFER_MS, reason: 'contact_policy_unavailable' };
  }
}

/**
 * SIM SMS markAttempting(): atomic reservation immediately before SmsManager.
 * Returns null (proceed) or { defer: ms, reason, cancel?: true }.
 */
export async function simSmsAttemptGate(message) {
  if (!SMS_TOUCH_KINDS.has(message.kind)) return null;
  const decision = await safeReserve({
    leadId: message.leadId, channel: 'sms', campaignId: message.campaignId, source: 'sim_sms', refId: String(message._id),
  });
  if (decision.allowed) return null;
  return { defer: deferMsFor(decision), reason: decision.reason, cancel: isHardBlock(decision.reason) };
}

/** SIM SMS result: a definite failure transmitted nothing → free the slot. */
export function simSmsResult(messageId, status) {
  const op = status === 'sent' ? 'commitByRef' : (status === 'failed' ? 'releaseByRef' : null);
  if (!op) return Promise.resolve(); // unknown stays reserved: it may have reached the lead
  return contactPolicyService[op]('sim_sms', String(messageId)).catch(() => {});
}

/**
 * Provider messaging — dispatchRecipient after the quota/frequency reservations,
 * before the provider call. Returns null (send) or the dispatch result: the
 * recipient is marked failed (limit) / suppressed (hard block) and its quota and
 * frequency reservations are released. A user can retry it later (existing retry).
 */
export async function messagingGate(service, recipient, campaign) {
  if (campaign.isTest) return null;
  const decision = await safeReserve({
    leadId: recipient.leadId, channel: recipient.channel, campaignId: campaign._id, source: 'messaging',
    refId: String(recipient.quotaReservationId || recipient._id),
  });
  if (decision.allowed) return null;
  const { default: MessageRecipient } = await import('../messaging/messageRecipient.model.js');
  const { refreshCampaignSummary } = await import('../messaging/messaging.service.js');
  await service._releaseQuotaReservation(recipient).catch(() => {});
  await service._releaseFrequencyReservation(recipient).catch(() => {});
  const blocked = isHardBlock(decision.reason);
  await MessageRecipient.updateOne({ _id: recipient._id, status: 'submitting' }, {
    $set: blocked
      ? { status: 'suppressed', quotaReservationState: 'released', 'eligibility.eligible': false }
      : { status: 'failed', failedAt: new Date(), quotaReservationState: 'released', error: { code: 'CONTACT_POLICY_LIMIT', message: `Cross-channel contact policy: ${decision.reason}${decision.nextAllowedAt ? ` (next allowed ${new Date(decision.nextAllowedAt).toISOString()})` : ''}` } },
    $addToSet: { 'eligibility.reasons': `contact_policy:${decision.reason}` },
  });
  await refreshCampaignSummary(campaign._id);
  return { [blocked ? 'suppressed' : 'failed']: true, reason: `contact_policy:${decision.reason}` };
}

/** Provider messaging: settle the reservation keyed by the dispatch token. */
export function messagingSettle(recipient, outcome) {
  const refId = recipient?.quotaReservationId ? String(recipient.quotaReservationId) : null;
  if (!refId) return Promise.resolve();
  return (outcome === 'consume' ? contactPolicyService.commitByRef('messaging', refId) : contactPolicyService.releaseByRef('messaging', refId)).catch(() => {});
}

/**
 * Manual one-off contact by a user (leadCommunication.create over HTTP): the
 * channel's own eligibility already blocked DNC/suppression; record the touch
 * (forced) so it counts against automated sends. Never throws.
 */
export async function recordManualTouch(doc, userId) {
  try {
    const channel = COMMUNICATION_CHANNEL[doc.channel];
    if (!channel) return null;
    return await contactPolicyService.reserve({
      leadId: doc.leadId, channel, source: 'manual', refId: String(doc._id), force: true, userId,
    });
  } catch (error) {
    logger.warn('manual contact touch not recorded', { module: 'contact-policy', error: error.message });
    return null;
  }
}

export const __test__ = { deferMsFor, FAIL_CLOSED_DEFER_MS, isObjectId: mongoose.isValidObjectId };
