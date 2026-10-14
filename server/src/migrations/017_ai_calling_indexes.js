import mongoose from 'mongoose';

/**
 * Indexes for the AI voice-calling module. Idempotent; mirrors the model
 * definitions so a fresh deploy and a migrated deploy converge. Does not touch
 * lead, auth, or messaging data.
 */
const SPECS = {
  callcampaigns: [
    { key: { createdBy: 1, createdAt: -1 }, name: 'owner_created' },
    { key: { status: 1, scheduledAt: 1 }, name: 'status_schedule' },
    { key: { isTest: 1 }, name: 'is_test' },
  ],
  campaignrecipients: [
    { key: { campaignId: 1, leadId: 1 }, unique: true, name: 'campaign_lead_unique' },
    { key: { leadId: 1, createdAt: -1 }, name: 'lead_history' },
    { key: { campaignId: 1, state: 1 }, name: 'campaign_state' },
    { key: { state: 1, nextAttemptAt: 1 }, name: 'state_next_attempt' },
    { key: { phoneHash: 1 }, name: 'phone_hash' },
  ],
  callrecords: [
    { key: { internalCallId: 1 }, unique: true, name: 'internal_call_unique' },
    { key: { recipientId: 1, attemptNumber: 1 }, unique: true, name: 'recipient_attempt_unique' },
    { key: { leadId: 1, createdAt: -1 }, name: 'lead_calls' },
    { key: { campaignId: 1, state: 1 }, name: 'campaign_state' },
    { key: { providerCallId: 1 }, name: 'provider_call' },
    { key: { createdBy: 1, createdAt: -1 }, name: 'owner_created' },
  ],
  callsuppressions: [
    { key: { phoneHash: 1 }, unique: true, name: 'phone_hash_unique' },
    { key: { leadId: 1 }, name: 'lead_suppression' },
  ],
  leadcalltransitions: [
    { key: { leadId: 1, createdAt: -1 }, name: 'lead_transitions' },
    { key: { campaignId: 1 }, name: 'campaign_transitions' },
  ],
  callwebhookevents: [
    { key: { eventKey: 1 }, unique: true, name: 'event_unique' },
    { key: { providerCallId: 1 }, name: 'provider_call_events' },
  ],
};

export async function up() {
  const db = mongoose.connection.db;
  for (const [collection, indexes] of Object.entries(SPECS)) {
    for (const spec of indexes) {
      try { await db.collection(collection).createIndex(spec.key, spec); }
      catch (error) { if (![85, 86].includes(error?.code)) throw error; }
    }
  }
}

export async function down() {
  const db = mongoose.connection.db;
  for (const [collection, indexes] of Object.entries(SPECS)) {
    const exists = await db.listCollections({ name: collection }).hasNext();
    if (!exists) continue;
    for (const spec of indexes) {
      try { await db.collection(collection).dropIndex(spec.name); } catch { /* already absent */ }
    }
  }
}
