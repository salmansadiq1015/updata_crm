import mongoose from 'mongoose';

/**
 * Initial migration: ensure indexes exist.
 * Mongoose auto-creates indexes from schema definitions,
 * but this migration ensures they exist before any data is written
 * and provides visibility into what was created.
 */
export async function up() {
  const db = mongoose.connection.db;

  // Ensure file_metadata indexes
  await db.collection('filemetadatas').createIndexes([
    { key: { bucket: 1, key: 1 }, unique: true, name: 'idx_bucket_key' },
    { key: { module: 1, entityType: 1, entityId: 1 }, name: 'idx_module_entity' },
    { key: { uploadedBy: 1, createdAt: -1 }, name: 'idx_uploader_date' },
    { key: { isDeleted: 1, deletedAt: 1 }, name: 'idx_soft_delete' },
    { key: { createdAt: -1 }, name: 'idx_created_desc' },
  ]);

  // Ensure event_log indexes (if collection exists)
  const collections = await db.listCollections({ name: 'eventlogs' }).toArray();
  if (collections.length > 0) {
    await db.collection('eventlogs').createIndexes([
      { key: { type: 1, publishedAt: -1 }, name: 'idx_type_published' },
      { key: { correlationId: 1 }, name: 'idx_correlation' },
      { key: { status: 1, publishedAt: -1 }, name: 'idx_status_published' },
    ]);
  }
}

export async function down() {
  const db = mongoose.connection.db;
  await db.collection('filemetadatas').dropIndexes();
}
