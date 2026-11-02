import mongoose from 'mongoose';
import { extensionBusinessType, isLegacyExtensionLead } from '../modules/crm/leadExtensionProvenance.js';
import { resolveLeadAddress } from '../modules/crm/leadLocation.js';
import logger from '../shared/logger/index.js';

/** Repair only proven extension records; keep ordinary imports/provider leads. */
export async function repairExtensionLead(lead) {
  if (lead.source !== 'extension' && lead.sourceMetadata?.importMethod !== 'extension' && !isLegacyExtensionLead(lead)) return null;
  const set = {};
  if (lead.source !== 'extension') set.source = 'extension';
  if (lead.sourceMetadata?.importMethod !== 'extension') set['sourceMetadata.importMethod'] = 'extension';
  const businessType = extensionBusinessType({
    category: lead.sourceMetadata?.businessType,
    categories: lead.sourceMetadata?.discoveryBusinessTypes,
    // The old extension CSV placed its per-lead search category first in tags.
    discoveryCategories: lead.tags,
  });
  if (businessType && !extensionBusinessType({ category: lead.sourceMetadata?.businessType })) set['sourceMetadata.businessType'] = businessType;
  if (!lead.address?.area) {
    const coords = lead.location?.coordinates;
    const address = await resolveLeadAddress({
      ...(lead.address ?? {}), latitude: coords?.[1], longitude: coords?.[0],
      fallbackLocation: lead.sourceMetadata?.searchLocation, resolveArea: true,
    });
    if (address.area || (!lead.address?.city && address.city) || (!lead.address?.country && address.country)) set.address = address;
  }
  return Object.keys(set).length ? set : null;
}

export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find({ isDeleted: { $ne: true }, source: { $in: ['extension', 'import', 'google_places'] } });
  let updated = 0;
  for await (const lead of cursor) {
    const set = await repairExtensionLead(lead);
    if (set) {
      const result = await leads.updateOne({ _id: lead._id, updatedAt: lead.updatedAt }, { $set: set });
      updated += result.modifiedCount;
    }
  }
  await leads.createIndex(
    { source: 1, 'sourceMetadata.googlePlaceId': 1 },
    { name: 'lead_extension_place_unique', unique: true, partialFilterExpression: { source: 'extension', 'sourceMetadata.googlePlaceId': { $type: 'string' } } },
  );
  logger.info(`038 extension-lead-provenance: repaired ${updated} lead(s)`, { module: 'migration' });
}

// A data repair; reverting would reinstate incorrect source labels and gaps.
export async function down() {}
