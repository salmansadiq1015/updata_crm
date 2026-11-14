import CampaignRecipient from './campaignRecipient.model.js';

const TEST_ELIGIBILITY = { eligible: false, reasons: ['browser_test_only'] };

/**
 * The recipient a browser test attaches its call record to. With a lead it is the
 * usual (campaignId, leadId) recipient, used only as read-only context. Without one it
 * is the campaign's built-in test contact (leadId null, `testContact`), so an agent can
 * be tested before any lead exists. Neither is ever dialled: it stays `draft` and
 * ineligible, and the call record is always `isTest`. Idempotent under retries/races.
 */
export async function ensureTestRecipient(campaignId, actor, leadId = null) {
  const filter = leadId ? { campaignId, leadId } : { campaignId, testContact: true };
  const insert = { createdBy: actor, state: 'draft', eligibility: TEST_ELIGIBILITY, ...(leadId ? {} : { leadId: null, testContact: true }) };
  try {
    await CampaignRecipient.updateOne(filter, { $setOnInsert: insert }, { upsert: true });
  } catch (error) {
    // A concurrent request inserted it first (unique campaignId+leadId).
    if (error?.code !== 11000) throw error;
  }
  return CampaignRecipient.findOne(filter);
}

export default { ensureTestRecipient };
