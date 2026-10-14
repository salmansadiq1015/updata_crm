import mongoose from 'mongoose';

const SPECS = {
  messagecampaigns: [
    { key: { createdBy: 1, channel: 1, createdAt: -1 }, name: 'owner_channel_created' },
    { key: { createdBy: 1, status: 1, createdAt: -1 }, name: 'owner_status_created' },
  ],
  messagerecipients: [
    { key: { campaignId: 1, status: 1, createdAt: 1 }, name: 'campaign_status_created' },
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
