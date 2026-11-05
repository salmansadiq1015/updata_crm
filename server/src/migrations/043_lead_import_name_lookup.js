import mongoose from 'mongoose';

// Batch extension imports first resolve indexed Maps identities, then use this
// index for normalized-name candidates and the null-name legacy subset.
export async function up() {
  await mongoose.connection.db.collection('leads').createIndex(
    { normalizedName: 1, isDeleted: 1 },
    { name: 'lead_import_name_lookup' },
  );
}

export async function down() {
  const leads = mongoose.connection.db.collection('leads');
  if (await leads.indexExists('lead_import_name_lookup')) await leads.dropIndex('lead_import_name_lookup');
}
