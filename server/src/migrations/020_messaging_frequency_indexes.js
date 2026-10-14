import mongoose from 'mongoose';

const SPECS = [
  { key: { key: 1 }, name: 'frequency_key_unique', unique: true },
  { key: { channel: 1, destinationHash: 1 }, name: 'frequency_destination_unique', unique: true },
];

export async function up() {
  const collection = mongoose.connection.db.collection('messagingfrequencyledgers');
  for (const spec of SPECS) {
    try { await collection.createIndex(spec.key, spec); }
    catch (error) { if (![85, 86].includes(error?.code)) throw error; }
  }
}

export async function down() {
  const db = mongoose.connection.db;
  if (!await db.listCollections({ name: 'messagingfrequencyledgers' }).hasNext()) return;
  for (const spec of SPECS) {
    try { await db.collection('messagingfrequencyledgers').dropIndex(spec.name); }
    catch { /* already absent */ }
  }
}
