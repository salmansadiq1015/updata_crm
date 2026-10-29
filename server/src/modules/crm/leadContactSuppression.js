import Lead from './lead.model.js';
import LeadCommunication from './leadCommunication.model.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import CallConsent from '../aiCalling/callConsent.model.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LeadChannelConsent from '../messaging/consent.model.js';
import logger from '../../shared/logger/index.js';

/**
 * "May this lead be contacted on this channel right now?" for follow-ups.
 * Delegates to the shared cross-channel contact policy (contactPolicy module)
 * when it is deployed; otherwise falls back to the hard blockers recorded in
 * this codebase (do-not-contact, channel suppression, revoked consent).
 *
 * Returns { suppressed, reason, reasons, nextAllowedAt, limited }:
 * - suppressed: a HARD block (DNC / suppression / revoked consent) — contact
 *   actions must be blocked.
 * - limited: a soft frequency/quiet-hours limit; shown as a warning with
 *   nextAllowedAt, not a block.
 * Follow-ups on channels without a contact gate (in person, letter, other,
 * none) only honour the lead-level do-not-contact.
 */

const POLICY_CHANNEL = { phone: 'voice', sms: 'sms', email: 'email', whatsapp: 'whatsapp' };

let policyModule;
async function loadPolicy() {
  if (policyModule !== undefined) return policyModule;
  try {
    const mod = await import('../contactPolicy/contactPolicy.service.js');
    policyModule = mod.contactPolicyService || mod.default || null;
  } catch (err) {
    logger.warn('Contact policy unavailable; using local suppression checks', { module: 'crm', error: { message: err.message } });
    policyModule = null;
  }
  return policyModule;
}

/** Test hook: force (or reset with undefined) the contact-policy implementation. */
export function __setContactPolicyForTests(impl) { policyModule = impl; }

async function fallbackCheck(leadId, channel) {
  const lead = await Lead.findById(leadId).select('_id').lean();
  if (!lead) return { suppressed: true, reason: 'lead_unavailable', reasons: ['lead_unavailable'], nextAllowedAt: null, limited: false };
  const msgChannel = ['sms', 'email', 'whatsapp'].includes(channel) ? channel : null;
  const [dncComm, dncCall, callSuppressed, callConsent, msgSuppressed, msgConsent] = await Promise.all([
    LeadCommunication.exists({ leadId, 'outcome.doNotContact': true }),
    CallSuppression.exists({ leadId, reason: 'do_not_contact' }),
    channel === 'phone' ? CallSuppression.exists({ leadId }) : null,
    channel === 'phone' ? CallConsent.findOne({ leadId }).sort({ updatedAt: -1 }).select('status').lean() : null,
    msgChannel ? MessageSuppression.exists({ leadId, channel: msgChannel }) : null,
    msgChannel ? LeadChannelConsent.findOne({ leadId, channel: msgChannel }).select('status').lean() : null,
  ]);
  const reasons = [];
  if (dncComm || dncCall) reasons.push('do_not_contact');
  if (callSuppressed && !reasons.includes('do_not_contact')) reasons.push('call_suppressed');
  if (msgSuppressed) reasons.push('channel_suppressed');
  if (['denied', 'revoked'].includes(callConsent?.status) || ['denied', 'revoked'].includes(msgConsent?.status)) reasons.push('consent_revoked');
  return { suppressed: reasons.length > 0, reason: reasons[0] ?? null, reasons, nextAllowedAt: null, limited: false };
}

export async function checkContactSuppression(leadId, channel) {
  const gated = POLICY_CHANNEL[channel];
  const policy = await loadPolicy();
  if (policy && typeof policy.check === 'function') {
    try {
      const decision = await policy.check({ leadId, channel: gated || 'voice' });
      const blockers = Array.isArray(decision.blockers) ? decision.blockers : [];
      // An ungated channel (in person, letter…) only honours the lead-level DNC.
      const hard = gated ? blockers : blockers.filter((r) => r === 'do_not_contact' || r === 'lead_unavailable');
      const limited = Boolean(gated) && !decision.allowed && !decision.blocked;
      return {
        suppressed: hard.length > 0,
        reason: hard[0] ?? (limited ? decision.reason : null),
        reasons: hard,
        nextAllowedAt: limited ? decision.nextAllowedAt ?? null : null,
        limited,
      };
    } catch (err) {
      logger.warn('Contact policy check failed; using local suppression checks', { module: 'crm', leadId: String(leadId), error: { message: err.message } });
    }
  }
  const local = await fallbackCheck(leadId, gated ? channel : null);
  if (!gated) {
    const hard = local.reasons.filter((r) => r === 'do_not_contact' || r === 'lead_unavailable');
    return { ...local, suppressed: hard.length > 0, reason: hard[0] ?? null, reasons: hard };
  }
  return local;
}

/** Batch helper with a per-call memo: [{ leadId, channel }] → Map(key → result). */
export async function checkManySuppressions(pairs) {
  const out = new Map();
  for (const { leadId, channel } of pairs) {
    const key = `${leadId}:${channel || ''}`;
    if (!out.has(key)) out.set(key, await checkContactSuppression(leadId, channel || null));
  }
  return out;
}
