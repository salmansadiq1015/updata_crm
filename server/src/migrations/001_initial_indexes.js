import mongoose from 'mongoose';

/**
 * Initial migration: ensure indexes exist.
 *
 * Mongoose creates these from the schema when the application boots, and this
 * migration states them explicitly so a fresh database has them before any
 * data is written.
 *
 * Which means both can happen — and on any server where the application ran
 * before the migrations did, mongoose got there first. It names an index after
 * its keys (`bucket_1_key_1`); this file names the same index `idx_bucket_key`,
 * and MongoDB refuses a second name for keys it already indexes. The migration
 * then failed, the runner stopped, and every later migration stayed unapplied.
 *
 * That is how a production server ended up with an empty `migrations`
 * collection while the code carried six of them: 001 had been failing since
 * the first boot, and nothing after it ever ran.
 *
 * So an index that already exists — under any name — is what this migration
 * wanted. Only a real failure is raised.
 */

/** MongoDB's code for "these keys are already indexed, under another name". */
const INDEX_EXISTS_UNDER_ANOTHER_NAME = 85;
/** And for "this name is taken by different keys". */
const INDEX_NAME_TAKEN = 86;

async function ensureIndexes(db, collectionName, specs) {
  for (const spec of specs) {
    try {
      await db.collection(collectionName).createIndexes([spec]);
    } catch (err) {
      if (err?.code === INDEX_EXISTS_UNDER_ANOTHER_NAME || err?.code === INDEX_NAME_TAKEN) {
        // eslint-disable-next-line no-console
        console.log(`001_initial_indexes: ${collectionName}.${spec.name} already covered — skipped`);
        continue;
      }
      throw err;
    }
  }
}

export async function up() {
  const db = mongoose.connection.db;

  await ensureIndexes(db, 'filemetadatas', [
    { key: { bucket: 1, key: 1 }, unique: true, name: 'idx_bucket_key' },
    { key: { module: 1, entityType: 1, entityId: 1 }, name: 'idx_module_entity' },
    { key: { uploadedBy: 1, createdAt: -1 }, name: 'idx_uploader_date' },
    { key: { isDeleted: 1, deletedAt: 1 }, name: 'idx_soft_delete' },
    { key: { createdAt: -1 }, name: 'idx_created_desc' },
  ]);

  // Ensure event_log indexes (if collection exists)
  const collections = await db.listCollections({ name: 'eventlogs' }).toArray();
  if (collections.length > 0) {
    await ensureIndexes(db, 'eventlogs', [
      { key: { type: 1, publishedAt: -1 }, name: 'idx_type_published' },
      { key: { correlationId: 1 }, name: 'idx_correlation' },
      { key: { status: 1, publishedAt: -1 }, name: 'idx_status_published' },
    ]);
  }
}

export async function down() {
  const db = mongoose.connection.db;

  // Drop filemetadatas indexes created in up() (by name to preserve _id index)
  const fmIndexes = ['idx_bucket_key', 'idx_module_entity', 'idx_uploader_date', 'idx_soft_delete', 'idx_created_desc'];
  for (const name of fmIndexes) {
    try {
      await db.collection('filemetadatas').dropIndex(name);
    } catch {
      // Index may not exist — safe to ignore
    }
  }

  // Drop eventlogs indexes created in up()
  const elIndexes = ['idx_type_published', 'idx_correlation', 'idx_status_published'];
  const collections = await db.listCollections({ name: 'eventlogs' }).toArray();
  if (collections.length > 0) {
    for (const name of elIndexes) {
      try {
        await db.collection('eventlogs').dropIndex(name);
      } catch {
        // Index may not exist — safe to ignore
      }
    }
  }
}
