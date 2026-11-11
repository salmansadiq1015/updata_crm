import CallRecord from '../modules/aiCalling/callRecord.model.js';
import InboundCall from '../modules/inboundCalling/inboundCall.model.js';
import logger from '../shared/logger/index.js';

/**
 * AI Calling + Incoming Calls read paths: indexes for the pages' list / analytics queries.
 *
 * - CallRecord { createdBy, createdAt:-1 }              call history + analytics without an in-memory sort
 * - CallRecord { createdBy, campaignId, createdAt:-1 }  per-agent call analytics (campaign $in, newest first)
 * - InboundCall { createdBy, createdAt:-1, _id:-1 }     incoming-call list paging (sort includes _id)
 * - InboundCall { assignedTo, createdAt:-1, _id:-1 }    the assignee branch of the owner-or-assignee scope
 *
 * Idempotent: createIndexes() builds only what is missing and leaves existing indexes alone.
 * The superseded InboundCall { createdBy, createdAt:-1 } index is dropped only after its
 * { createdBy, createdAt:-1, _id:-1 } replacement exists (a prefix of it serves the same queries).
 */
export const name = '054_calling_indexes';

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function up() {
  for (const model of [CallRecord, InboundCall]) await model.createIndexes();
  try {
    const indexes = await InboundCall.collection.indexes();
    const hasNew = indexes.some((i) => sameKey(i.key, { createdBy: 1, createdAt: -1, _id: -1 }));
    const old = indexes.find((i) => sameKey(i.key, { createdBy: 1, createdAt: -1 }));
    if (hasNew && old) await InboundCall.collection.dropIndex(old.name);
  } catch (err) {
    logger.warn('Old inbound createdBy/createdAt index not dropped', { module: 'migration', error: err.message });
  }
}

/** Restores the original inbound index before removing the ones this migration added. */
export async function down() {
  try {
    await InboundCall.collection.createIndex({ createdBy: 1, createdAt: -1 });
    for (const [model, names] of [[CallRecord, ['owner_recent_calls', 'owner_campaign_calls']], [InboundCall, ['owner_recent_inbound', 'assignee_recent_inbound']]]) {
      const existing = new Set((await model.collection.indexes()).map((i) => i.name));
      for (const n of names) if (existing.has(n)) await model.collection.dropIndex(n);
    }
  } catch (err) {
    logger.warn('054 down incomplete', { module: 'migration', error: err.message });
  }
}

export default { name, up, down };
