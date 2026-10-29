import LeadCommunication from './leadCommunication.model.js';
import CallRecord from '../aiCalling/callRecord.model.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import SimSmsMessage from '../simSms/simSmsMessage.model.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LinkOptOutEvent from '../linkAssistant/optOutEvent.model.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import logger from '../../shared/logger/index.js';

/**
 * Gather the recorded engagement signals the scoring engine reads, as plain,
 * serializable data (so a score can be reproduced from a stored snapshot).
 * Every list is bounded; nothing here is inferred — only records that exist.
 */
const LIMIT = 200;

const idOf = (doc) => String(doc._id);
const atOf = (...dates) => dates.find((d) => d) || null;

function phoneCandidates(lead) {
  const out = new Set();
  for (const raw of [lead?.mobile, lead?.phone]) {
    if (!raw) continue;
    for (const n of [normalizePhone(String(raw), lead?.address?.country || 'CH'), normalizePhone(String(raw))]) {
      if (n?.valid && n.e164) out.add(n.e164);
    }
  }
  return [...out];
}

export async function collectSignals(lead) {
  const leadId = lead._id;
  const [comms, calls, replies, smsSent, callDnc, smsOptOut, linkOptOut] = await Promise.all([
    LeadCommunication.find({ leadId, 'receipt.steps.outcome.status': 'ok' })
      .select('channel outcome completedAt createdAt').sort({ createdAt: -1 }).limit(LIMIT).lean(),
    CallRecord.find({ leadId, isTest: { $ne: true } })
      .select('disposition qualification answeredAt endedAt createdAt').sort({ createdAt: -1 }).limit(LIMIT).lean(),
    SimSmsMessage.find({ leadId, direction: 'inbound' })
      .select('receivedAt createdAt').sort({ createdAt: -1 }).limit(LIMIT).lean(),
    SimSmsMessage.countDocuments({ leadId, direction: 'outbound', status: { $in: ['sent', 'delivered'] } }),
    CallSuppression.find({ leadId, reason: 'do_not_contact' }).select('suppressedAt source').sort({ suppressedAt: 1 }).limit(5).lean(),
    MessageSuppression.find({ leadId, reason: 'opt_out' }).select('suppressedAt source channel').sort({ suppressedAt: 1 }).limit(5).lean(),
    LinkOptOutEvent.find({ leadId }).select('receivedAt source').sort({ receivedAt: 1 }).limit(5).lean(),
  ]);

  // A do-not-contact recorded against the lead's number (from any lead that
  // shared it) blocks this lead as well — same rule as the SMS/call gates.
  let phoneDnc = [];
  try {
    const hashes = phoneCandidates(lead).map((e) => phoneHash(e));
    if (hashes.length) {
      phoneDnc = await CallSuppression.find({ phoneHash: { $in: hashes }, reason: 'do_not_contact', leadId: { $ne: leadId } })
        .select('suppressedAt source').sort({ suppressedAt: 1 }).limit(5).lean();
    }
  } catch (err) {
    logger.debug('Phone-hash DNC lookup skipped', { module: 'crm', action: 'leadScoring.signals', error: { message: err.message } });
  }

  const communications = comms.map((c) => ({
    id: idOf(c),
    channel: c.channel,
    connected: c.outcome?.connected || 'unknown',
    disposition: c.outcome?.disposition || null,
    doNotContact: Boolean(c.outcome?.doNotContact) || c.outcome?.disposition === 'do_not_contact',
    at: atOf(c.completedAt, c.createdAt),
  }));

  const dnc = [
    ...communications.filter((c) => c.doNotContact).map((c) => ({ source: 'lead_communication', at: c.at, ref: { type: 'lead_communication', id: c.id } })),
    ...calls.filter((c) => c.disposition === 'do_not_contact').map((c) => ({ source: 'ai_call', at: atOf(c.endedAt, c.createdAt), ref: { type: 'call_record', id: idOf(c) } })),
    ...callDnc.map((s) => ({ source: `call_suppression:${s.source || 'manual'}`, at: s.suppressedAt, ref: { type: 'call_suppression', id: idOf(s) } })),
    ...phoneDnc.map((s) => ({ source: `call_suppression:${s.source || 'manual'}`, at: s.suppressedAt, ref: { type: 'call_suppression', id: idOf(s) } })),
    ...smsOptOut.map((s) => ({ source: `message_suppression:${s.channel}`, at: s.suppressedAt, ref: { type: 'message_suppression', id: idOf(s) } })),
    ...linkOptOut.map((o) => ({ source: `opt_out:${o.source}`, at: o.receivedAt, ref: { type: 'opt_out_event', id: idOf(o) } })),
  ].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));

  return {
    communications,
    calls: calls.map((c) => ({
      id: idOf(c),
      disposition: c.disposition || null,
      qualification: c.qualification || null,
      answeredAt: c.answeredAt || null,
      at: atOf(c.endedAt, c.answeredAt, c.createdAt),
    })),
    smsReplies: replies.map((m) => ({ id: idOf(m), at: atOf(m.receivedAt, m.createdAt) })),
    smsSent,
    dnc,
  };
}

export default { collectSignals };
