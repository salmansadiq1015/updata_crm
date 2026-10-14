import mongoose from 'mongoose';

const INDEX = {
  key: { provider: 1, status: 1, lastReconciliationAt: 1, createdAt: 1 },
  name: 'provider_status_reconciliation_due',
};

export async function up() {
  try { await mongoose.connection.db.collection('messagerecipients').createIndex(INDEX.key, INDEX); }
  catch (error) { if (![85, 86].includes(error?.code)) throw error; }
}

export async function down() {
  const collection = mongoose.connection.db.collection('messagerecipients');
  const exists = await mongoose.connection.db.listCollections({ name: 'messagerecipients' }).hasNext();
  if (!exists) return;
  try { await collection.dropIndex(INDEX.name); } catch { /* already absent */ }
}
