import mongoose from 'mongoose';
import { extensionBusinessType, isLegacyExtensionLead } from '../modules/crm/leadExtensionProvenance.js';
import { repairedExtensionBusinessType } from './041_extension_business_type_repair.js';
import logger from '../shared/logger/index.js';

/** 041 may already be applied: newly recognized Maps action text needs a new repair. */
export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find({ isDeleted: { $ne: true }, $or: [
    { source: { $in: ['extension', 'import', 'google_places'] } },
    { 'sourceMetadata.importMethod': 'extension' },
  ] });
  let repaired = 0;
  let unrecoverable = 0;
  let operations = [];
  const flush = async () => {
    if (!operations.length) return;
    const result = await leads.bulkWrite(operations, { ordered: false });
    repaired += result.modifiedCount;
    operations = [];
  };
  for await (const lead of cursor) {
    const proven = lead.source === 'extension' || lead.sourceMetadata?.importMethod === 'extension' || isLegacyExtensionLead(lead);
    if (!proven || extensionBusinessType({ category: lead.sourceMetadata?.businessType, businessName: lead.name })) continue;
    const businessType = repairedExtensionBusinessType(lead);
    if (!businessType) { unrecoverable += 1; continue; }
    operations.push({ updateOne: {
      // Do not overwrite a concurrent edit or invent a type from the name.
      filter: { _id: lead._id, updatedAt: lead.updatedAt, 'sourceMetadata.businessType': lead.sourceMetadata?.businessType ?? null },
      update: { $set: { 'sourceMetadata.businessType': businessType } },
    } });
    if (operations.length === 500) await flush();
  }
  await flush();
  logger.info('044 extension Maps-action business-type repair', { module: 'migration', repaired, unrecoverable });
  return { repaired, unrecoverable };
}

// Restoring action text as a business category would reintroduce the defect.
export async function down() {}
