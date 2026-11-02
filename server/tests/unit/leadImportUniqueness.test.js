import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest, beforeAll, beforeEach, afterAll, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/crm/leadQuality.hooks.js', () => ({ onLeadsCreated: jest.fn(), onLeadChanged: jest.fn() }));
jest.unstable_mockModule('../../src/modules/businessDiscovery/provider/NominatimProvider.js', () => ({ nominatimProvider: { isConfigured: () => false } }));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({ default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

let mongo, Lead, service, repository;
const actor = new mongoose.Types.ObjectId();
const record = (extra = {}) => ({
  clientId: 'local-lion', businessName: 'Lion fitness', category: 'Gym',
  city: 'Mohammedia', country: 'MA', street: '12 Boulevard', area: 'City Centre',
  googleMapsUrl: 'https://www.google.com/maps/place/Lion+fitness/data=!1sChIJlion!8m2!3d33.68!4d-7.38', ...extra,
});
beforeAll(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  repository = (await import('../../src/modules/crm/lead.repository.js')).default;
  service = (await import('../../src/modules/crm/leadImportExport.service.js')).default;
  // Register populated refs used by repository update responses.
  await import('../../src/modules/auth/user.model.js');
  await Lead.init();
}, 60000);
beforeEach(async () => { await Lead.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const upload = (row) => Buffer.from('name,extensionRecord\r\nLion,"' + JSON.stringify(row).replace(/"/g, '""') + '"\r\n');

describe('real import service + MongoDB uniqueness', () => {
  it('imports one business once when concurrent structured and CSV fallback requests overlap without placeIdentifier', async () => {
    const [structured, file] = await Promise.all([
      service.importExtensionLeads([record()], actor),
      service.importLeads({ source: 'extension', mimetype: 'text/csv', originalname: 'extension.csv', buffer: upload(record()) }, actor),
    ]);
    expect(await Lead.countDocuments({})).toBe(1);
    expect(structured.created + file.summary.created).toBe(1);
    expect(structured.existing + file.summary.duplicates).toBe(1);
    expect(structured.failed + file.summary.failed).toBe(0);
    expect(structured.results[0].leadId).toBe(file.results[0].leadId);
  });
  it('recognizes a legacy Import lead by its Maps URL instead of creating a Google/extension copy', async () => {
    const existing = await Lead.create({ name: 'Lion fitness', leadNumber: 'L-88000', source: 'import', notes: `Google Maps: ${record().googleMapsUrl}`, createdBy: actor });
    const result = await service.importExtensionLeads([record({ placeIdentifier: 'ChIJlion' })], actor);
    expect(result).toMatchObject({ created: 0, existing: 1, failed: 0 });
    expect(result.results[0].leadId).toBe(String(existing._id));
    expect(await Lead.countDocuments({})).toBe(1);
  });
  it('blocks concurrent ID-less exact-branch copies, but keeps the same brand at another address', async () => {
    const plain = record({ googleMapsUrl: 'https://www.google.com/maps/place/Lion+fitness' });
    const results = await Promise.all([service.importExtensionLeads([plain], actor), service.importExtensionLeads([plain], actor)]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.existing, 0)).toBe(1);
    const other = await service.importExtensionLeads([{ ...plain, street: '55 Boulevard' }], actor);
    expect(other.created).toBe(1);
    expect(await Lead.countDocuments({})).toBe(2);
  });
  it('keeps different place IDs even if branches share the same phone, website and brand', async () => {
    const results = await service.importExtensionLeads([
      record({ placeIdentifier: 'branch-a', googleMapsUrl: 'https://www.google.com/maps?query_place_id=branch-a', phone: '0611111111', website: 'https://chain.example' }),
      record({ placeIdentifier: 'branch-b', googleMapsUrl: 'https://www.google.com/maps?query_place_id=branch-b', phone: '0611111111', website: 'https://chain.example' }),
    ], actor);
    expect(results).toMatchObject({ created: 2, existing: 0, failed: 0 });
  });
  it('counts same-file legacy CSV duplicates honestly instead of failing one row', async () => {
    const row = `Lion fitness,Mohammedia,MA,12 Boulevard,Google Maps: ${record().googleMapsUrl}`;
    const result = await service.importLeads({ mimetype: 'text/csv', originalname: 'legacy.csv', buffer: Buffer.from(`name,city,country,street,notes\r\n${row}\r\n${row}\r\n`) }, actor);
    expect(result.summary).toMatchObject({ total: 2, created: 1, duplicates: 1, failed: 0 });
    expect(await Lead.countDocuments({})).toBe(1);
  });
  it('updates identity keys when the branch address changes', async () => {
    const result = await service.importExtensionLeads([record({ googleMapsUrl: 'https://www.google.com/maps/place/Lion' })], actor);
    const first = await Lead.findById(result.results[0].leadId).lean();
    await repository.update(first._id, { 'address.street': 'New Street 55' });
    const moved = await Lead.findById(first._id).lean();
    expect(moved.businessIdentityKeys).not.toEqual(first.businessIdentityKeys);
    expect(await repository.findImportDuplicates({ name: 'Lion fitness', source: 'extension', address: { street: 'New Street 55', city: 'Mohammedia', country: 'MA' } })).toHaveLength(1);
  });

  it('allows an explicit deletion followed by re-import while keeping one live business', async () => {
    const first = await service.importExtensionLeads([record({ placeIdentifier: 'ChIJlion' })], actor);
    await repository.softDelete(first.results[0].leadId);
    const again = await service.importExtensionLeads([record({ placeIdentifier: 'ChIJlion' })], actor);
    expect(again).toMatchObject({ created: 1, existing: 0, failed: 0 });
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(1);
    expect(await Lead.countDocuments({ isDeleted: true })).toBe(1);
  });
});

describe('historical duplicate cleanup', () => {
  it('merges proven Import/Google copies, moves history, retains richer data and opt-outs, and is idempotent', async () => {
    const migration = await import('../../src/migrations/039_lead_business_uniqueness.js');
    const firstId = new mongoose.Types.ObjectId(); const secondId = new mongoose.Types.ObjectId();
    const now = new Date();
    await Lead.collection.createIndex({ 'sourceMetadata.googlePlaceId': 1 }, { unique: true, partialFilterExpression: { source: 'google_places' } });
    await Lead.collection.createIndex({ source: 1, 'sourceMetadata.googlePlaceId': 1 }, {
      name: 'lead_extension_place_unique', unique: true, partialFilterExpression: { source: 'extension', 'sourceMetadata.googlePlaceId': { $type: 'string' } },
    });
    // Raw insertion represents records that predate identity-key enforcement.
    await Lead.collection.insertMany([
      { _id: firstId, name: 'Lion fitness', leadNumber: 'L-88100', type: 'business', source: 'google_places', status: 'new', isDeleted: false, createdBy: actor, createdAt: new Date(now - 1000), sourceMetadata: { googlePlaceId: 'ChIJlion' } },
      { _id: secondId, name: 'Lion fitness', leadNumber: 'L-88101', type: 'business', source: 'import', status: 'new', isDeleted: false, createdBy: actor, createdAt: now, email: 'lion@example.com', tags: ['Gym'], notes: `Google Maps: ${record().googleMapsUrl}`, sourceMetadata: { businessType: 'Gym' } },
    ]);
    const Communication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
    const historyId = new mongoose.Types.ObjectId();
    await Communication.collection.insertOne({ _id: historyId, leadId: secondId, channel: 'phone', note: 'Keep this call history' });
    const Suppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
    const suppressionId = new mongoose.Types.ObjectId();
    await Suppression.collection.insertOne({ _id: suppressionId, leadId: secondId, channel: 'email', reason: 'opt_out' });
    await migration.up();
    const indexes = await Lead.collection.listIndexes().toArray();
    expect(indexes.map((index) => index.name)).toContain('lead_business_identity_unique');
    expect(indexes.map((index) => index.name)).not.toContain('lead_extension_place_unique');
    expect(indexes.map((index) => index.name)).not.toContain('sourceMetadata.googlePlaceId_1');
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(1);
    const survivor = await Lead.findById(firstId).lean();
    expect(survivor).toMatchObject({ email: 'lion@example.com', sourceMetadata: { businessType: 'Gym' } });
    expect(survivor.tags).toContain('Gym');
    expect(survivor.mergedLeadIds.map(String)).toContain(String(secondId));
    expect(String((await Communication.collection.findOne({ _id: historyId })).leadId)).toBe(String(firstId));
    expect(await Suppression.collection.findOne({ _id: suppressionId })).toMatchObject({ leadId: firstId, reason: 'opt_out' });
    const archived = await Lead.collection.findOne({ _id: secondId });
    expect(archived.isDeleted).toBe(true);
    expect(String(archived.mergedInto)).toBe(String(firstId));
    const journals = await mongoose.connection.db.collection('leadmerges').find({ survivorId: firstId }).toArray();
    expect(journals).toHaveLength(1); expect(journals[0].status).toBe('completed');
    const retry = await service.importExtensionLeads([record()], actor);
    expect(retry).toMatchObject({ created: 0, existing: 1, failed: 0 });
    await migration.up();
    expect(await mongoose.connection.db.collection('leadmerges').countDocuments({ survivorId: firstId })).toBe(1);
  });

  it('does not merge same-name businesses when only the city is known', async () => {
    const migration = await import('../../src/migrations/039_lead_business_uniqueness.js');
    await Lead.collection.insertMany([0, 1].map((i) => ({
      _id: new mongoose.Types.ObjectId(), name: 'Lion fitness', leadNumber: `L-8820${i}`,
      type: 'business', source: 'import', status: 'new', isDeleted: false, createdBy: actor,
      address: { city: 'Mohammedia', country: 'MA' }, notes: 'Google Maps: https://www.google.com/maps/place/Lion+fitness',
    })));
    await migration.up();
    expect(await Lead.countDocuments({})).toBe(2);
  });

  it('replaces obsolete indexes before transferring an ID from an extension duplicate', async () => {
    const migration = await import('../../src/migrations/039_lead_business_uniqueness.js');
    await Lead.collection.createIndex({ source: 1, 'sourceMetadata.googlePlaceId': 1 }, {
      name: 'lead_extension_place_unique', unique: true, partialFilterExpression: { source: 'extension', 'sourceMetadata.googlePlaceId': { $type: 'string' } },
    });
    const firstId = new mongoose.Types.ObjectId();
    const base = { name: 'Lion fitness', type: 'business', source: 'extension', status: 'new', isDeleted: false, createdBy: actor };
    await Lead.collection.insertMany([
      { ...base, _id: firstId, leadNumber: 'L-88250', createdAt: new Date(0), providerMeta: { mapsUrl: record().googleMapsUrl } },
      { ...base, _id: new mongoose.Types.ObjectId(), leadNumber: 'L-88251', createdAt: new Date(), sourceMetadata: { googlePlaceId: 'ChIJlion' } },
    ]);
    await migration.up();
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(1);
    expect((await Lead.findById(firstId).lean()).sourceMetadata.googlePlaceId).toBe('ChIJlion');
  });

  it('keeps conflicting converted leads for review and retains their evidence on subsequent scans', async () => {
    const migration = await import('../../src/migrations/039_lead_business_uniqueness.js');
    const firstId = new mongoose.Types.ObjectId(); const secondId = new mongoose.Types.ObjectId();
    await Lead.collection.insertMany([
      { _id: firstId, leadNumber: 'L-88300', name: 'Lion fitness', type: 'business', source: 'google_places', status: 'converted', isDeleted: false, createdBy: actor, sourceMetadata: { googlePlaceId: 'ChIJlion' } },
      { _id: secondId, leadNumber: 'L-88301', name: 'Lion fitness', type: 'business', source: 'import', status: 'converted', isDeleted: false, createdBy: actor, notes: `Google Maps: ${record().googleMapsUrl}` },
    ]);
    await migration.up();
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(2);
    const candidates = mongoose.connection.db.collection('leadduplicatecandidates');
    const filter = { leadIds: { $all: [firstId, secondId] } };
    expect(await candidates.findOne(filter)).toMatchObject({ status: 'open', reasons: [expect.objectContaining({ method: 'BUSINESS_IDENTITY' })] });
    const duplicateService = (await import('../../src/modules/crm/leadDuplicate.service.js')).default;
    await duplicateService.scanAll();
    expect(await candidates.findOne(filter)).toMatchObject({ status: 'open' });
    await migration.up();
    expect(await candidates.countDocuments(filter)).toBe(1);
  });

  it('transfers claimed Maps identities during a manual merge and restores them on undo', async () => {
    const mergeService = (await import('../../src/modules/crm/leadMerge.service.js')).default;
    const first = await Lead.create({ name: 'Branch A', leadNumber: 'L-88400', source: 'extension', sourceMetadata: { googlePlaceId: 'branch-a' }, createdBy: actor });
    const second = await Lead.create({ name: 'Branch B', leadNumber: 'L-88401', source: 'extension', sourceMetadata: { googlePlaceId: 'branch-b' }, createdBy: actor });
    const merged = await mergeService.merge({ survivorId: first._id, loserId: second._id }, actor);
    const matches = await repository.findImportDuplicates({ name: 'Branch B', sourceMetadata: { googlePlaceId: 'branch-b' } });
    expect(String(matches[0].lead._id)).toBe(String(first._id));
    await mergeService.undo(merged.id, actor);
    const restored = await repository.findImportDuplicates({ name: 'Branch B', sourceMetadata: { googlePlaceId: 'branch-b' } });
    expect(String(restored[0].lead._id)).toBe(String(second._id));
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(2);
  });
});
