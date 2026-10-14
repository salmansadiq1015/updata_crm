import mongoose from 'mongoose';

const SPECS = {
  messagetemplates: [
    { key: { channel: 1, isArchived: 1, createdAt: -1 }, name: 'channel_archive_created' },
    { key: { createdBy: 1, name: 1 }, name: 'owner_name' },
  ],
  messagecampaigns: [
    { key: { createdBy: 1, createdAt: -1 }, name: 'owner_created' },
    { key: { status: 1, scheduledAt: 1 }, name: 'status_schedule' },
  ],
  messagerecipients: [
    { key: { campaignId: 1, leadId: 1 }, unique: true, name: 'campaign_lead_unique' },
    { key: { leadId: 1, createdAt: -1 }, name: 'lead_history' },
    { key: { createdBy: 1, status: 1, createdAt: -1 }, name: 'owner_status_created' },
    { key: { provider: 1, providerMessageId: 1 }, unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } }, name: 'provider_message_unique' },
  ],
  providersubmissionattempts: [
    { key: { idempotencyKey: 1 }, unique: true, name: 'idempotency_unique' },
    { key: { recipientId: 1, attemptNumber: 1 }, unique: true, name: 'recipient_attempt_unique' },
    { key: { campaignId: 1 }, name: 'campaign_attempts' },
  ],
  messagedeliveryevents: [
    { key: { eventKey: 1 }, unique: true, name: 'event_unique' },
    { key: { provider: 1, providerMessageId: 1 }, name: 'provider_message_events' },
  ],
  leadchannelconsents: [{ key: { leadId: 1, channel: 1 }, unique: true, name: 'lead_channel_unique' }],
  messagesuppressions: [
    { key: { channel: 1, destinationHash: 1 }, unique: true, name: 'channel_destination_unique' },
    { key: { leadId: 1 }, name: 'lead_suppression' },
  ],
  messagingprovidersettings: [{ key: { key: 1 }, unique: true, name: 'settings_key_unique' }],
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
