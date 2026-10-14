import mongoose from 'mongoose';

const COLLECTION = 'messagerecipients';
const INDEX = {
  key: { quotaReservationId: 1 },
  name: 'quota_reservation_unique',
  unique: true,
  partialFilterExpression: { quotaReservationId: { $type: 'objectId' } },
};

export async function up() {
  try {
    await mongoose.connection.db.collection(COLLECTION).createIndex(INDEX.key, INDEX);
  } catch (error) {
    if (![85, 86].includes(error?.code)) throw error;
  }
}

export async function down() {
  const exists = await mongoose.connection.db.listCollections({ name: COLLECTION }).hasNext();
  if (!exists) return;
  try { await mongoose.connection.db.collection(COLLECTION).dropIndex(INDEX.name); }
  catch { /* already absent */ }
}
