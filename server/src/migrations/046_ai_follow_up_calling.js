import LeadFollowUp from '../modules/crm/leadFollowUp.model.js';
import CallCampaign from '../modules/aiCalling/callCampaign.model.js';

/**
 * AI follow-up calling (aiCalling/followUpCalling.service.js).
 *
 * Indexes only. Every new field (CallingAgent.agentType/followUp, LeadFollowUp.automation,
 * CallCampaign.kind/followUpId, CallRecord.followUpId/previousCallId,
 * AiCallingSettings.followUpAutomation, agentConfig.instructions) is an additive schema
 * default: existing documents read as "standard campaign / human follow-up / automation
 * off" with no backfill, so this migration never rewrites user data.
 *
 * All three indexes are partial, so they only cover AI-managed follow-ups and follow-up
 * campaigns and build quickly on an existing collection.
 */
export const name = '046_ai_follow_up_calling';

export async function up() {
  await LeadFollowUp.collection.createIndex({ 'automation.state': 1, nextDueAt: 1 },
    { name: 'follow_up_ai_due', partialFilterExpression: { 'automation.mode': 'ai' } });
  await LeadFollowUp.collection.createIndex({ 'automation.agentId': 1, 'automation.state': 1, nextDueAt: 1 },
    { name: 'follow_up_ai_agent', partialFilterExpression: { 'automation.mode': 'ai' } });
  await CallCampaign.collection.createIndex({ followUpId: 1 },
    { name: 'campaign_follow_up', partialFilterExpression: { followUpId: { $type: 'objectId' } } });
}

export async function down() {
  await LeadFollowUp.collection.dropIndex('follow_up_ai_due').catch(() => {});
  await LeadFollowUp.collection.dropIndex('follow_up_ai_agent').catch(() => {});
  await CallCampaign.collection.dropIndex('campaign_follow_up').catch(() => {});
}

export default { name, up, down };
