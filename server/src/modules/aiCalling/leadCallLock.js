import CampaignRecipient from './campaignRecipient.model.js';
import InboundCall from '../inboundCalling/inboundCall.model.js';
import { ACTIVE_STATUSES as INBOUND_ACTIVE } from '../inboundCalling/engine/stateMachine.js';

/**
 * One call per lead, across every channel the CRM drives:
 *  - an outbound AI call (any campaign, any agent, follow-up calls included) is "active" while its
 *    recipient is dialing / in_progress / processing;
 *  - an incoming call is "active" from detection until it is processed (InboundCall ACTIVE_STATUSES).
 * Callers decide what to do (outbound defers, inbound hands the call to a person); this only answers
 * "is the lead already on a call, and which kind". Reads are on indexed fields (leadId+state,
 * leadId+createdAt) and every competing outbound claim is in 'dialing' BEFORE it checks, so two
 * concurrent outbound dispatches always see each other.
 */
export const OUTBOUND_ACTIVE_RECIPIENT_STATES = Object.freeze(['dialing', 'in_progress', 'processing']);

export async function leadActiveCall(leadId, { exceptRecipientId = null, exceptInboundCallId = null } = {}) {
  if (!leadId) return { busy: false, kind: null };
  const [outbound, inbound] = await Promise.all([
    CampaignRecipient.findOne({ leadId, state: { $in: OUTBOUND_ACTIVE_RECIPIENT_STATES }, ...(exceptRecipientId ? { _id: { $ne: exceptRecipientId } } : {}) })
      .select('_id campaignId state').lean(),
    InboundCall.findOne({ leadId, processedAt: null, status: { $in: [...INBOUND_ACTIVE] }, ...(exceptInboundCallId ? { _id: { $ne: exceptInboundCallId } } : {}) })
      .select('_id status').lean(),
  ]);
  if (outbound) return { busy: true, kind: 'outbound', recipientId: String(outbound._id), campaignId: String(outbound.campaignId) };
  if (inbound) return { busy: true, kind: 'inbound', inboundCallId: String(inbound._id), status: inbound.status };
  return { busy: false, kind: null };
}
