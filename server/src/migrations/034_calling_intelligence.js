import CallRecord from '../modules/aiCalling/callRecord.model.js';
import { KnowledgeEntry, KnowledgeVersion } from '../modules/aiCalling/knowledge.model.js';
import TransferPresence from '../modules/aiCalling/transferPresence.model.js';

/**
 * Calling intelligence: review-queue + ringing-transfer indexes on call records,
 * and the approved-knowledge and transfer-presence collections. Additive only:
 * existing calls and agents need no data conversion (absent fields = no
 * extraction yet, latest published knowledge, transfer disabled).
 */
export const name = '034_calling_intelligence';
export async function up() {
  await CallRecord.collection.createIndex({ createdBy: 1, 'intelligence.pendingReview': 1, endedAt: -1 }, {
    partialFilterExpression: { 'intelligence.pendingReview': { $gt: 0 } }, name: 'intelligence_review_queue',
  });
  await CallRecord.collection.createIndex({ 'handoff.offeredTo': 1, 'handoff.status': 1 }, {
    partialFilterExpression: { 'handoff.status': 'ringing' }, name: 'handoff_ringing',
  });
  await KnowledgeEntry.createIndexes();
  await KnowledgeVersion.createIndexes();
  await TransferPresence.createIndexes();
}
export async function down() {
  await CallRecord.collection.dropIndex('intelligence_review_queue').catch(() => {});
  await CallRecord.collection.dropIndex('handoff_ringing').catch(() => {});
  // Knowledge versions, entries and presence are retained: rollback never deletes user records.
}
export default { name, up, down };
