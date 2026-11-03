import mongoose from 'mongoose';
import { extensionBusinessType, isLegacyExtensionLead } from '../modules/crm/leadExtensionProvenance.js';
import logger from '../shared/logger/index.js';

/** Use saved per-lead discovery provenance; never infer from today's selection. */
export function repairedExtensionBusinessType(lead) {
  if (lead.source !== 'extension' && lead.sourceMetadata?.importMethod !== 'extension' && !isLegacyExtensionLead(lead)) return null;
  if (extensionBusinessType({ category: lead.sourceMetadata?.businessType, businessName: lead.name })) return null;
  return extensionBusinessType({ discoveryCategories: lead.sourceMetadata?.discoveryBusinessTypes });
}

export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find({ isDeleted: { $ne: true }, $or: [
    { source: { $in: ['extension', 'import', 'google_places'] } },
    { 'sourceMetadata.importMethod': 'extension' },
  ] });
  let updated = 0;
  for await (const lead of cursor) {
    const businessType = repairedExtensionBusinessType(lead);
    if (!businessType) continue;
    const result = await leads.updateOne({ _id: lead._id, updatedAt: lead.updatedAt }, {
      $set: { 'sourceMetadata.businessType': businessType },
    });
    updated += result.modifiedCount;
  }
  logger.info(`041 extension-business-type-repair: repaired ${updated} lead(s)`, { module: 'migration' });
}

// Data repair: restoring invalid categories would reintroduce the defect.
export async function down() {}
