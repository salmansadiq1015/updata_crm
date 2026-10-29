import Lead from '../modules/crm/lead.model.js';
import LeadScoringConfig from '../modules/crm/leadScoringConfig.model.js';
import LeadDuplicateCandidate from '../modules/crm/leadDuplicateCandidate.model.js';
import LeadMerge from '../modules/crm/leadMerge.model.js';

/**
 * Lead quality (explainable scoring + duplicate review/merge).
 *
 * - Indexes for the new collections and the new lead fields.
 * - Backfills lead.scoreValue = -1 ("unscored") where missing, so the score
 *   sort's cursor pagination never skips leads without the field.
 *
 * Idempotent. Scores themselves are NOT computed here (that needs the engagement
 * collections and is long-running): after deploy, POST /crm/lead-scoring/recompute
 * (or the 15-minute sweep) fills them; the nightly duplicate scan (or POST
 * /crm/lead-duplicates/scan) seeds the review queue.
 */
export const name = '033_lead_quality';

export async function up() {
  await LeadScoringConfig.createIndexes();
  await LeadDuplicateCandidate.createIndexes();
  await LeadMerge.createIndexes();
  await Lead.collection.createIndex({ email: 1 });
  await Lead.collection.createIndex({ normalizedName: 1 }, { name: 'lead_normalized_name' });
  await Lead.collection.createIndex({ scoreValue: -1, _id: -1 });
  await Lead.collection.createIndex({ 'score.band': 1 });
  await Lead.collection.createIndex({ mergedInto: 1 }, { partialFilterExpression: { mergedInto: { $type: 'objectId' } } });
  await Lead.collection.updateMany({ scoreValue: { $exists: false } }, { $set: { scoreValue: -1 } });
}

export async function down() {
  // Indexes only; never deletes merge journals, candidates or scores.
  for (const idx of ['email_1', 'lead_normalized_name', 'scoreValue_-1__id_-1', 'score.band_1', 'mergedInto_1']) {
    await Lead.collection.dropIndex(idx).catch(() => {});
  }
}

export default { name, up, down };
