import mongoose from 'mongoose';

/**
 * Indexes for the AI calling reliability work: reconciliation sweep, dispatch
 * lease recovery, tick watchdog and the campaign-local daily cap.
 *
 * Creates ONLY these named indexes, and skips any whose key already exists
 * under another name — Model.createIndexes() would also try to (re)create every
 * schema index and fails on production databases where earlier migrations
 * created the same keys under custom names (e.g. `is_test`). Additive and
 * idempotent; no data is changed. New CallRecord / CallCampaign fields default
 * to null/0 and need no backfill.
 */
export const name = '026_ai_calling_reliability_indexes';

const UNPROCESSED = { partialFilterExpression: { resultsProcessedAt: null } };
export const INDEXES = [
  ['callrecords', { state: 1, initiatedAt: 1 }, { name: 'reconcile_state_initiatedAt', ...UNPROCESSED }],
  ['callrecords', { processingLeaseUntil: 1 }, { name: 'reconcile_processing_lease', ...UNPROCESSED }],
  ['callrecords', { campaignId: 1, initiatedAt: 1 }, { name: 'campaignId_1_initiatedAt_1' }],
  ['campaignrecipients', { state: 1, leaseUntil: 1 }, { name: 'state_1_leaseUntil_1' }],
  ['campaignrecipients', { phoneHash: 1, state: 1 }, { name: 'phoneHash_1_state_1' }],
  ['callcampaigns', { status: 1, nextTickAt: 1 }, { name: 'status_1_nextTickAt_1' }],
];

const sameKey = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

async function existingIndexes(collection) {
  return collection.listIndexes().toArray().catch((error) => {
    if (error?.code === 26) return []; // collection not created yet
    throw error;
  });
}

export async function up({ db = mongoose.connection.db } = {}) {
  for (const [collectionName, key, options] of INDEXES) {
    const collection = db.collection(collectionName);
    const existing = await existingIndexes(collection);
    if (existing.some((index) => index.name === options.name || sameKey(index.key, key))) continue;
    await collection.createIndex(key, options);
  }
}

export async function down({ db = mongoose.connection.db } = {}) {
  for (const [collectionName, , options] of INDEXES) {
    await db.collection(collectionName).dropIndex(options.name).catch(() => {}); // absent → nothing to undo
  }
}

export default { name, up, down };
