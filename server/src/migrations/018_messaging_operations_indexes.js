import mongoose from 'mongoose';

const SPECS = {
  messagecampaigns: [
    { key: { createdBy: 1, isTest: 1, createdAt: -1 }, name: 'owner_test_created' },
  ],
  messagerecipients: [
    { key: { status: 1, submissionStartedAt: 1 }, name: 'status_submission_recovery' },
  ],
  messagedeliveryevents: [
    { key: { leadId: 1, createdBy: 1, occurredAt: -1 }, name: 'lead_owner_timeline' },
    { key: { campaignId: 1, occurredAt: -1 }, name: 'campaign_event_timeline' },
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
