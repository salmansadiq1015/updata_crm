import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { connectTestDb, disconnectTestDb } from '../setup.js';
import { up } from '../../src/migrations/001_initial_indexes.js';

/**
 * The migration that was stopping every other migration.
 *
 * Mongoose builds these indexes from the schema when the application boots,
 * and names them after their keys — `bucket_1_key_1`. This migration names the
 * same index `idx_bucket_key`, and MongoDB refuses a second name for keys it
 * already indexes. On any server where the application booted before the
 * migrations ran, 001 failed, the runner stopped, and nothing after it was
 * ever applied.
 *
 * That is not hypothetical: production carried six migrations in its code and
 * an empty `migrations` collection, because 001 had been failing since the
 * first boot.
 */
beforeAll(async () => { await connectTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

beforeEach(async () => {
  const db = mongoose.connection.db;
  await db.collection('filemetadatas').drop().catch(() => { /* not there yet */ });
});

const names = async () =>
  (await mongoose.connection.db.collection('filemetadatas').indexes()).map((i) => i.name);

describe('001 — the initial indexes', () => {
  test('creates them on a database that has none', async () => {
    await up();
    expect(await names()).toEqual(expect.arrayContaining(['idx_bucket_key', 'idx_module_entity']));
  });

  test('runs twice without complaining', async () => {
    await up();
    await expect(up()).resolves.toBeUndefined();
  });

  test('accepts an index mongoose already built under its own name', async () => {
    // The exact production situation: the application booted first.
    await mongoose.connection.db.collection('filemetadatas')
      .createIndex({ bucket: 1, key: 1 }, { unique: true, name: 'bucket_1_key_1' });

    await expect(up()).resolves.toBeUndefined();

    // The keys are indexed, which is all the migration ever wanted — under
    // whichever name got there first.
    const after = await names();
    expect(after).toContain('bucket_1_key_1');
    expect(after).toEqual(expect.arrayContaining(['idx_module_entity', 'idx_created_desc']));
  });

  test('one covered index does not stop the ones after it', async () => {
    // The failure mode that mattered: createIndexes took the whole list, so
    // the first conflict lost the other four.
    await mongoose.connection.db.collection('filemetadatas')
      .createIndex({ bucket: 1, key: 1 }, { unique: true, name: 'bucket_1_key_1' });

    await up();
    expect(await names()).toEqual(expect.arrayContaining([
      'idx_module_entity', 'idx_uploader_date', 'idx_soft_delete', 'idx_created_desc',
    ]));
  });
});
