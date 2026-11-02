import mongoose from 'mongoose';
import leadMergeService from '../modules/crm/leadMerge.service.js';
import { businessIdentityKeys, BUSINESS_IDENTITY_INDEX, sameBusinessIdentity } from '../modules/crm/leadIdentity.js';
import logger from '../shared/logger/index.js';

/** Consolidate confirmed copies through the history-preserving merge journal. */
export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  const candidates = mongoose.connection.db.collection('leadduplicatecandidates');
  // Protect new writes before replacing the old source-specific constraints.
  // Those constraints also covered archived leads and blocked transferring a
  // loser's place ID to a survivor with no separately recorded ID.
  await leads.createIndex({ businessIdentityKeys: 1 }, BUSINESS_IDENTITY_INDEX);
  for (const index of await leads.listIndexes().toArray()) {
    if (index.name === 'lead_extension_place_unique'
      || (index.unique && index.partialFilterExpression?.source === 'google_places'
        && index.key?.['sourceMetadata.googlePlaceId'] === 1)) {
      await leads.dropIndex(index.name);
    }
  }
  await leads.createIndex({ 'sourceMetadata.googlePlaceId': 1 }, { name: 'lead_google_place_lookup' });
  const records = await leads.find({ isDeleted: false }).sort({ createdAt: 1, _id: 1 }).toArray();
  records.sort((a, b) => Number(Boolean(b.convertedCustomerId || b.status === 'converted')) - Number(Boolean(a.convertedCustomerId || a.status === 'converted')));
  const owners = new Map();
  let merged = 0; let flagged = 0;
  for (const original of records) {
    let current = await leads.findOne({ _id: original._id, isDeleted: false });
    if (!current) continue;
    let keys = businessIdentityKeys(current);
    let ownerId = keys.map((key) => owners.get(key)).find(Boolean);
    while (ownerId && String(ownerId) !== String(current._id)) {
      const owner = await leads.findOne({ _id: ownerId, isDeleted: false });
      if (!owner) { for (const [key, id] of owners) if (String(id) === String(ownerId)) owners.delete(key); break; }
      const actor = owner.createdBy || current.createdBy;
      if (actor && sameBusinessIdentity(owner, current) && current.status !== 'converted' && !current.convertedCustomerId) {
        await leadMergeService.merge({ survivorId: owner._id, loserId: current._id }, actor, { userAgent: 'migration/039' });
        merged += 1;
        const loserId = current._id;
        current = await leads.findOne({ _id: owner._id });
        for (const [key, id] of owners) if (String(id) === String(loserId)) owners.set(key, owner._id);
        keys = businessIdentityKeys(current);
        ownerId = keys.map((key) => owners.get(key)).find((id) => id && String(id) !== String(current._id));
      } else {
        const ids = [owner._id, current._id].sort((a, b) => String(a).localeCompare(String(b)));
        const now = new Date();
        await candidates.updateOne({ pairKey: ids.map(String).join('_') }, {
          $setOnInsert: { leadIds: ids, status: 'open', detectedAt: now },
          $set: { lastSeenAt: now, confidence: 0.999, reasons: [{ method: 'BUSINESS_IDENTITY', value: keys.find((key) => owners.has(key)), confidence: 1 }] },
        }, { upsert: true });
        flagged += 1;
        keys = keys.filter((key) => !owners.has(key));
        break;
      }
    }
    await leads.updateOne({ _id: current._id }, { $set: { businessIdentityKeys: keys } });
    for (const key of keys) owners.set(key, current._id);
  }
  logger.info('039 business lead uniqueness ready', { module: 'migration', merged, flagged });
}

// Full merge snapshots remain available through the existing undo workflow.
export async function down() {}
