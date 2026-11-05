import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest, describe, it, beforeAll, afterAll, beforeEach, expect } from '@jest/globals';
import { performance } from 'node:perf_hooks';

jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../leadQuality.hooks.js', () => ({ onLeadsCreated: jest.fn(), onLeadSignalsChanged: jest.fn() }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({ leadImportsTotal: { inc: jest.fn() } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({ default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

let mongod, Lead, repository, service;
const queries = [];
const actor = new mongoose.Types.ObjectId();
const records = (count, prefix = 'batch') => Array.from({ length: count }, (_, i) => ({
  clientId: `${prefix}-${i}`, businessName: `Hotel ${prefix} ${i}`, placeIdentifier: `place-${prefix}-${i}`,
  street: `${i + 1} Main Road`, city: 'Lahore', area: 'Gulberg', country: 'PK',
  phone: '+92 42 1234567', rating: 4.5, reviewCount: 10,
}));
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Lead = (await import('../lead.model.js')).default;
  repository = (await import('../lead.repository.js')).default;
  service = (await import('../leadImportExport.service.js')).default;
  await Lead.init();
  mongoose.set('debug', (collection, operation) => queries.push({ collection, operation }));
});
afterAll(async () => {
  mongoose.set('debug', false);
  await mongoose.disconnect();
  await mongod?.stop();
});
beforeEach(async () => { await Lead.deleteMany({}); queries.length = 0; });

describe('extension bulk import against MongoDB', () => {
  it.each([10, 100, 500])('inserts %i selected leads with one database insert and one number reservation', async (size) => {
    const started = performance.now();
    const result = await service.importExtensionLeads(records(size), actor);
    const elapsedMs = Math.round(performance.now() - started);
    expect(result).toMatchObject({ total: size, created: size, failed: 0 });
    expect(queries.filter((q) => q.collection === 'leads' && q.operation === 'insertMany')).toHaveLength(1);
    expect(queries.filter((q) => q.collection === 'counters' && q.operation === 'findOneAndUpdate')).toHaveLength(1);
    expect(queries.filter((q) => q.collection === 'leads' && q.operation === 'find').length).toBeLessThanOrEqual(2);
    const stored = await Lead.find({}).lean();
    expect(new Set(stored.map((lead) => lead.leadNumber)).size).toBe(size);
    expect(stored.every((lead) => String(lead.createdBy) === String(actor))).toBe(true);
    console.log(`BULK_IMPORT_BENCHMARK ${JSON.stringify({ size, elapsedMs, database: 'isolated local MongoDB', externalGeocoding: false })}`);
  });
  it('removes per-lead database round trips compared with the previous serial path', async () => {
    const before = performance.now();
    await service._importExtensionSingle(records(10, 'serial'), actor, {});
    const serialMs = Math.round(performance.now() - before);
    const serialOperations = queries.length;
    queries.length = 0;
    const after = performance.now();
    await service.importExtensionLeads(records(10, 'bulk'), actor);
    const bulkMs = Math.round(performance.now() - after);
    const bulkOperations = queries.length;
    expect(bulkOperations).toBeLessThan(serialOperations / 2);
    console.log(`IMPORT_COMPARISON ${JSON.stringify({ size: 10, serialMs, bulkMs, serialOperations, bulkOperations })}`);
  });
  it('creates and rolls back the supporting name index idempotently', async () => {
    const migration = await import('../../../migrations/043_lead_import_name_lookup.js');
    await migration.up(); await migration.up();
    expect(await Lead.collection.indexExists('lead_import_name_lookup')).toBe(true);
    await migration.down(); await migration.down();
    expect(await Lead.collection.indexExists('lead_import_name_lookup')).toBe(false);
    await migration.up();
  });
  it('reimports the same selection in one indexed read without duplicate records', async () => {
    const batch = records(10);
    await service.importExtensionLeads(batch, actor);
    queries.length = 0;
    const result = await service.importExtensionLeads(batch, actor);
    expect(result).toMatchObject({ created: 0, existing: 10, failed: 0 });
    expect(queries.filter((q) => q.collection === 'leads' && q.operation === 'find')).toHaveLength(1);
    expect(queries.filter((q) => q.collection === 'leads' && ['insertMany', 'findOneAndUpdate', 'updateOne'].includes(q.operation))).toHaveLength(0);
    expect(await Lead.countDocuments()).toBe(10);
  });
  it('preserves strict identity for separate branches sharing a name, phone and website', async () => {
    const batch = records(2).map((record) => ({ ...record, businessName: 'Same Chain', website: 'https://example.com' }));
    const result = await service.importExtensionLeads([...batch, { ...batch[0], clientId: 'repeat' }], actor);
    expect(result).toMatchObject({ created: 2, existing: 1, failed: 0 });
    expect(result.results[2].leadId).toBe(result.results[0].leadId);
    expect(await Lead.countDocuments()).toBe(2);
  });
  it('matches legacy Maps imports in a mixed batch while ignoring soft-deleted records', async () => {
    const mapsUrl = 'https://www.google.com/maps?query_place_id=legacy-place';
    const existing = await Lead.create({ name: 'Legacy Hotel', leadNumber: 'L-LEGACY', source: 'import', notes: `Google Maps: ${mapsUrl}`, createdBy: actor });
    await Lead.create({ name: 'Deleted Hotel', leadNumber: 'L-DELETED', source: 'extension', sourceMetadata: { googlePlaceId: 'deleted-place' }, isDeleted: true, createdBy: actor });
    const result = await service.importExtensionLeads([
      { ...records(1)[0], businessName: 'Legacy Hotel', placeIdentifier: 'legacy-place', googleMapsUrl: mapsUrl },
      { ...records(1)[0], clientId: 'deleted-retry', businessName: 'Deleted Hotel', placeIdentifier: 'deleted-place' },
    ], actor);
    expect(result).toMatchObject({ created: 1, existing: 1, failed: 0 });
    expect(result.results[0].leadId).toBe(String(existing._id));
  });
  it('resolves simultaneous imports through the unique database index', async () => {
    const batch = records(10);
    const results = await Promise.all([service.importExtensionLeads(batch, actor), service.importExtensionLeads(batch, actor)]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(10);
    expect(results.reduce((sum, result) => sum + result.existing, 0)).toBe(10);
    expect(results.every((result) => result.failed === 0)).toBe(true);
    expect(await Lead.countDocuments()).toBe(10);
  });
  it('maps validation failures to their original input alongside confirmed insertions', async () => {
    const result = await repository.bulkCreate([
      { leadNumber: 'L-VAL1', name: 'Valid first', createdBy: actor },
      { leadNumber: 'L-VAL2', name: '', createdBy: actor },
      { leadNumber: 'L-VAL3', name: 'Valid last', createdBy: actor },
    ]);
    expect(result.created.map((lead) => lead.name)).toEqual(['Valid first', 'Valid last']);
    expect(result.errors).toEqual([expect.objectContaining({ index: 1 })]);
    expect(result.insertedCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });  it('keeps error indexes correct when validation and duplicate-key failures occur together', async () => {
    await repository.bulkCreate([{ leadNumber: 'L-DUP', name: 'Original', createdBy: actor }]);
    const result = await repository.bulkCreate([
      { leadNumber: 'L-MIX1', name: 'First', createdBy: actor },
      { leadNumber: 'L-MIX2', name: '', createdBy: actor },
      { leadNumber: 'L-DUP', name: 'Duplicate number', createdBy: actor },
      { leadNumber: 'L-MIX3', name: 'Last', createdBy: actor },
    ]);
    expect(result.created.map((lead) => lead.name)).toEqual(['First', 'Last']);
    expect(result.errors.map((error) => error.index).sort()).toEqual([1, 2]);
    expect(result.errors.find((error) => error.index === 2).code).toBe(11000);
  });

});
