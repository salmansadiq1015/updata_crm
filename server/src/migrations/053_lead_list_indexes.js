import Lead from '../modules/crm/lead.model.js';
import LeadFollowUp from '../modules/crm/leadFollowUp.model.js';
import logger from '../shared/logger/index.js';

/**
 * Leads list + follow-up inbox: indexes for the cursor-paginated list sorts and
 * the company-wide inbox buckets. Idempotent: only the indexes named here are
 * created (createIndex is a no-op when an identical index exists), never the
 * whole schema — a failure on an unrelated declared index cannot block this.
 * The superseded { status, nextDueAt } 'follow_up_sweep' index is dropped only
 * once its { status, nextDueAt, _id } superset exists.
 */
export const name = '053_lead_list_indexes';

const LEAD_INDEXES = [
  [{ isDeleted: 1, createdAt: -1, _id: -1 }, { name: 'lead_list_recent' }],
  [{ 'sourceMetadata.businessType': 1, createdAt: -1, _id: -1 }, { name: 'lead_list_business_type' }],
  [{ name: 1, _id: 1 }, { name: 'lead_list_name' }],
];

const FOLLOW_UP_INDEXES = [
  [{ status: 1, nextDueAt: 1, _id: 1 }, { name: 'follow_up_status_due' }],
  [{ status: 1, closedAt: -1, _id: -1 }, { name: 'follow_up_closed' }],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function ensure(collection, specs) {
  const existing = await collection.indexes().catch(() => []);
  for (const [key, options] of specs) {
    // Same key under another name → already served; createIndex would throw.
    if (existing.some((index) => sameKey(index.key, key))) continue;
    await collection.createIndex(key, options);
  }
}

export async function up() {
  await ensure(Lead.collection, LEAD_INDEXES);
  await ensure(LeadFollowUp.collection, FOLLOW_UP_INDEXES);
  try {
    const indexes = await LeadFollowUp.collection.indexes();
    const hasNew = indexes.some((i) => sameKey(i.key, { status: 1, nextDueAt: 1, _id: 1 }));
    const old = indexes.find((i) => sameKey(i.key, { status: 1, nextDueAt: 1 }));
    if (hasNew && old) await LeadFollowUp.collection.dropIndex(old.name);
  } catch (err) {
    logger.warn('Old follow_up_sweep index not dropped', { module: 'migration', error: err.message });
  }
}

export async function down() {
  // Restore the former sweep index before removing its replacement.
  const followUps = await LeadFollowUp.collection.indexes().catch(() => []);
  if (!followUps.some((i) => sameKey(i.key, { status: 1, nextDueAt: 1 }))) {
    await LeadFollowUp.collection.createIndex({ status: 1, nextDueAt: 1 }, { name: 'follow_up_sweep' });
  }
  for (const [, { name: indexName }] of FOLLOW_UP_INDEXES) {
    await LeadFollowUp.collection.dropIndex(indexName).catch(() => {});
  }
  for (const [, { name: indexName }] of LEAD_INDEXES) {
    await Lead.collection.dropIndex(indexName).catch(() => {});
  }
}

export default { name, up, down };
