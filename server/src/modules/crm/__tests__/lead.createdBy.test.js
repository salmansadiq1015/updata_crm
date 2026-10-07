import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// "Created by" provenance against the real data layer (Lead + User models, the
// lead repository, the L-##### counter), so what is asserted is what Mongoose
// actually does with populate + lean + the cursor, not a mock's idea of it.
// Only the peripheral services (audit, metrics, notifications, logger) are mocked.
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../notifications/notification.service.js', () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({
  leadImportsTotal: { inc: jest.fn() },
  discoveryPlacesApiCallsTotal: { inc: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let mongod;
let Lead;
let User;
let DiscoveryResult;
let LeadImportJob;
let leadRepository;
let leadService;
let leadImportExportService;
let importService;
let LeadImportWorker;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  Lead = (await import('../lead.model.js')).default;
  User = (await import('../../auth/user.model.js')).default;
  DiscoveryResult = (await import('../../businessDiscovery/discoveryResult.model.js')).default;
  LeadImportJob = (await import('../../businessDiscovery/leadImportJob.model.js')).default;
  leadRepository = (await import('../lead.repository.js')).default;
  leadService = (await import('../lead.service.js')).default;
  leadImportExportService = (await import('../leadImportExport.service.js')).default;
  importService = (await import('../../businessDiscovery/import.service.js')).default;
  ({ LeadImportWorker } = await import('../../../jobs/leadImport.job.js'));

  // Unique leadNumber + the partial googlePlaceId index the imports rely on.
  await Lead.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    Lead.deleteMany({}),
    User.deleteMany({}),
    DiscoveryResult.deleteMany({}),
    LeadImportJob.deleteMany({}),
  ]);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const roleId = new mongoose.Types.ObjectId();
let userSeq = 0;
let leadSeq = 0;
let resultSeq = 0;

async function makeUser(overrides = {}) {
  userSeq += 1;
  return User.create({
    email: `user${userSeq}@example.ch`,
    passwordHash: 'not-a-real-hash',
    firstName: `First${userSeq}`,
    lastName: `Last${userSeq}`,
    role: roleId,
    ...overrides,
  });
}

function leadDoc(createdBy, overrides = {}) {
  leadSeq += 1;
  return {
    leadNumber: `L-9${String(leadSeq).padStart(4, '0')}`,
    name: `Lead ${leadSeq}`,
    createdBy,
    ...overrides,
  };
}

function makeResultDoc(createdBy, sessionId, placeId) {
  resultSeq += 1;
  return {
    createdBy,
    discoverySessionId: sessionId,
    provider: { name: 'google_places', placeId },
    business: {
      name: `Biz ${placeId}`,
      address: {
        street: 'Bahnhofstrasse 1', city: 'Zürich', postalCode: '8001', canton: 'ZH', country: 'CH',
      },
      phone: `+41441${String(resultSeq).padStart(6, '0')}`,
      website: `https://${placeId.toLowerCase()}.example.ch`,
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    },
    matching: { status: 'NEW' },
    import: { status: 'NOT_IMPORTED' },
    discoveryContext: { businessTypeIds: ['restaurant'], keyword: 'pizza' },
  };
}

const idOf = (value) => String(value?._id ?? value);

// ── Read side: the creator comes back as a populated user ────────────────────

describe('leadRepository — createdBy is populated', () => {
  it('getById names the creator and the assignee, and nothing else about them', async () => {
    const author = await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    const owner = await makeUser({ firstName: 'Grace', lastName: 'Hopper' });
    const lead = await Lead.create(leadDoc(author._id, { assignedTo: owner._id }));

    const found = await leadRepository.getById(lead._id);

    expect(found.createdBy).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', email: author.email });
    expect(idOf(found.createdBy)).toBe(String(author._id));
    expect(found.assignedTo).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', email: owner.email });
    expect(idOf(found.assignedTo)).toBe(String(owner._id));
    // Display fields only: no role, status, password hash, preferences ...
    expect(Object.keys(found.createdBy).sort()).toEqual(['_id', 'email', 'firstName', 'lastName']);
    // Still lean: a plain object, not a Mongoose document.
    expect(found.toObject).toBeUndefined();
  });

  it('getById keeps an unassigned lead unassigned and still honours the createdBy scope', async () => {
    const author = await makeUser();
    const stranger = await makeUser();
    const lead = await Lead.create(leadDoc(author._id));

    const found = await leadRepository.getById(lead._id);
    expect(found.assignedTo).toBeNull();

    expect(await leadRepository.getById(lead._id, { createdBy: stranger._id })).toBeNull();
    expect(idOf((await leadRepository.getById(lead._id, { createdBy: author._id })).createdBy)).toBe(String(author._id));
  });

  it('the service hands the populated lead through untouched', async () => {
    const author = await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    const lead = await Lead.create(leadDoc(author._id));

    const viaService = await leadService.getById(lead._id);
    expect(viaService.createdBy).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });

    const page = await leadService.list({ limit: 10 });
    expect(page.data[0].createdBy).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('list names the creator on every row and keeps the cursor pagination intact', async () => {
    const ada = await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    const alan = await makeUser({ firstName: 'Alan', lastName: 'Turing' });
    await Lead.create([
      leadDoc(ada._id, { name: 'A Bakery' }),
      leadDoc(alan._id, { name: 'B Bistro' }),
      leadDoc(ada._id, { name: 'C Cafe' }),
    ]);

    const first = await leadRepository.list({ limit: 2, sortBy: 'name', sortOrder: 'asc' });
    expect(first.data.map((lead) => lead.name)).toEqual(['A Bakery', 'B Bistro']);
    expect(first.data.map((lead) => lead.createdBy.firstName)).toEqual(['Ada', 'Alan']);
    expect(first.pagination).toMatchObject({ hasNext: true, limit: 2, total: 3 });
    expect(typeof first.pagination.nextCursor).toBe('string');

    const second = await leadRepository.list({
      limit: 2, sortBy: 'name', sortOrder: 'asc', cursor: first.pagination.nextCursor,
    });
    expect(second.data.map((lead) => lead.name)).toEqual(['C Cafe']);
    expect(second.data[0].createdBy).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(second.pagination).toEqual({ hasNext: false, nextCursor: null, limit: 2, total: 3 });
  });

  it('list filters and searches exactly as before (the filter runs on the raw ids)', async () => {
    const author = await makeUser();
    const owner = await makeUser({ firstName: 'Grace', lastName: 'Hopper' });
    await Lead.create([
      leadDoc(author._id, { name: 'Müller AG', status: 'new', assignedTo: owner._id }),
      leadDoc(author._id, { name: 'Meier GmbH', status: 'contacted' }),
    ]);

    const mine = await leadRepository.list({ filters: { assignedTo: String(owner._id) } });
    expect(mine.data.map((lead) => lead.name)).toEqual(['Müller AG']);
    expect(mine.data[0].assignedTo).toMatchObject({ firstName: 'Grace' });

    const contacted = await leadRepository.list({ filters: { status: 'contacted' } });
    expect(contacted.data.map((lead) => lead.name)).toEqual(['Meier GmbH']);

    const accentInsensitive = await leadRepository.list({ search: 'muller' });
    expect(accentInsensitive.data.map((lead) => lead.name)).toEqual(['Müller AG']);
    expect(accentInsensitive.data[0].createdBy).toMatchObject({ email: author.email });
  });

  it('filters by lead type and database-backed place, and exposes only live filter options', async () => {
    const author = await makeUser();
    const deleted = await Lead.create(leadDoc(author._id, {
      name: 'Deleted Lugano Lead',
      type: 'private',
      address: { city: 'Lugano', canton: 'TI', country: 'CH' },
    }));
    await Lead.updateOne({ _id: deleted._id }, { isDeleted: true, deletedAt: new Date() });
    await Lead.create([
      leadDoc(author._id, {
        name: 'Zürich Business',
        type: 'business',
        address: { city: 'Zürich', canton: 'ZH', country: 'CH' },
      }),
      leadDoc(author._id, {
        name: 'Zürich Private',
        type: 'private',
        address: { city: 'Zürich', canton: 'ZH', country: 'CH' },
      }),
      leadDoc(author._id, {
        name: 'Basel Business',
        type: 'business',
        address: { city: 'Basel', canton: 'BS', country: 'CH' },
      }),
      leadDoc(author._id, {
        name: 'Paris Discovery Business',
        type: 'business',
        address: { city: 'Boulogne-Billancourt', country: 'FR' },
        sourceMetadata: {
          discoveryLocation: { name: 'Paris', city: 'Paris', countryCode: 'FR' },
        },
      }),
    ]);

    const filtered = await leadRepository.list({ filters: { city: 'Zürich', type: 'private' } });
    expect(filtered.data.map((lead) => lead.name)).toEqual(['Zürich Private']);
    const discoveryPlaceFiltered = await leadRepository.list({ filters: { city: 'Paris' } });
    expect(discoveryPlaceFiltered.data.map((lead) => lead.name)).toEqual(['Paris Discovery Business']);

    const options = await leadRepository.getFilterOptions();
    expect(options.places).toEqual([
      { city: 'Basel', cantons: ['BS'], count: 1 },
      { city: 'Paris', cantons: [], count: 1 },
      { city: 'Zürich', cantons: ['ZH'], count: 2 },
    ]);
    expect(options.types).toEqual([
      { value: 'business', count: 3 },
      { value: 'private', count: 1 },
    ]);
  });

  it('update returns the saved lead with the creator populated', async () => {
    const author = await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    const lead = await Lead.create(leadDoc(author._id));

    const updated = await leadRepository.update(lead._id, { status: 'contacted' });

    expect(updated.status).toBe('contacted');
    expect(updated.createdBy).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('keeps naming a creator and an assignee whose account was soft-deleted', async () => {
    const gone = await makeUser({ firstName: 'Gone', lastName: 'Colleague' });
    const lead = await Lead.create(leadDoc(gone._id, { assignedTo: gone._id }));
    await User.updateOne({ _id: gone._id }, { isDeleted: true, deletedAt: new Date() });

    const found = await leadRepository.getById(lead._id);
    expect(found.createdBy).toMatchObject({ firstName: 'Gone', lastName: 'Colleague' });
    expect(found.assignedTo).toMatchObject({ firstName: 'Gone', lastName: 'Colleague' });

    // The User model's own soft-delete hook is untouched for everybody else.
    expect(await User.findById(gone._id).lean()).toBeNull();
  });

  it('degrades to null (and does not throw) when the creator no longer exists', async () => {
    const lead = await Lead.create(leadDoc(new mongoose.Types.ObjectId()));

    const found = await leadRepository.getById(lead._id);
    expect(found.name).toBe(lead.name);
    expect(found.createdBy).toBeNull();

    const page = await leadRepository.list({});
    expect(page.data).toHaveLength(1);
    expect(page.data[0].createdBy).toBeNull();
  });
});

// ── Write side: every way a lead comes into existence stamps createdBy ───────

describe('createdBy is stamped on every lead-creation path', () => {
  it('manual create: the caller, never a createdBy smuggled into the payload', async () => {
    const author = await makeUser({ firstName: 'Ada', lastName: 'Lovelace' });
    const intruder = await makeUser();

    const created = await leadService.create({ name: 'Manual AG', createdBy: intruder._id }, author._id, {});

    const stored = await Lead.findById(created._id).lean();
    expect(String(stored.createdBy)).toBe(String(author._id));
    expect((await leadRepository.getById(created._id)).createdBy).toMatchObject({
      firstName: 'Ada', lastName: 'Lovelace',
    });
  });

  it('file import: every imported lead belongs to the importing user', async () => {
    const importer = await makeUser({ firstName: 'Grace', lastName: 'Hopper' });
    const csv = ['name;city', 'Alpha AG;Zürich', 'Beta GmbH;Bern', 'Gamma SA;Genève'].join('\n');

    const result = await leadImportExportService.importLeads(
      { buffer: Buffer.from(csv, 'utf8'), mimetype: 'text/csv', originalname: 'leads.csv' },
      importer._id,
      {},
    );

    expect(result.summary).toMatchObject({ total: 3, created: 3, failed: 0 });
    const stored = await Lead.find({ source: 'import' }).lean();
    expect(stored).toHaveLength(3);
    for (const lead of stored) expect(String(lead.createdBy)).toBe(String(importer._id));

    const { data } = await leadRepository.list({ filters: { source: 'import' } });
    expect(data).toHaveLength(3);
    for (const lead of data) {
      expect(lead.createdBy).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', email: importer.email });
    }
  });

  it('extension import: derives ownership, deduplicates place ids, and keeps partial failures isolated', async () => {
    const importer = await makeUser({ firstName: 'Katherine', lastName: 'Johnson' });
    const attacker = await makeUser({ firstName: 'Wrong', lastName: 'Owner' });
    const base = {
      businessName: 'Checkpoint Hotel',
      category: 'Hotel',
      categories: ['Hotel'],
      placeIdentifier: 'EXTENSION-PLACE-1',
      phone: '+41 44 555 01 01',
      website: 'https://checkpoint.example',
      emails: ['hello@checkpoint.example'],
      address: 'Main Street 1, Zürich',
      street: 'Main Street 1',
      city: 'Zürich',
      state: 'ZH',
      postalCode: '8001',
      country: 'CH',
      latitude: 47.3769,
      longitude: 8.5417,
      rating: 4.7,
      reviewCount: 321,
      createdBy: attacker._id,
    };
    const result = await leadImportExportService.importExtensionLeads([
      { ...base, clientId: 'local-1' },
      { ...base, clientId: 'local-2' },
      { clientId: 'local-invalid', businessName: '' },
    ], importer._id, {});

    expect(result).toMatchObject({ total: 3, created: 1, existing: 1, failed: 1 });
    expect(result.results.map((item) => item.status)).toEqual(['created', 'existing', 'failed']);
    const stored = await Lead.findOne({ 'sourceMetadata.googlePlaceId': 'EXTENSION-PLACE-1' }).lean();
    expect(stored).not.toBeNull();
    expect(String(stored.createdBy)).toBe(String(importer._id));
    expect(String(stored.createdBy)).not.toBe(String(attacker._id));
    expect(stored.providerMeta).toMatchObject({ rating: 4.7, reviewCount: 321 });
  });

  it('discovery import (inline): the lead belongs to the importing user', async () => {
    const importer = await makeUser({ firstName: 'Alan', lastName: 'Turing' });
    const result = await DiscoveryResult.create(
      makeResultDoc(importer._id, new mongoose.Types.ObjectId(), 'PLACE-INLINE'),
    );

    const summary = await importService.processBatch([result.toObject()], { mode: 'new' }, importer._id);

    expect(summary.imported).toBe(1);
    const stored = await Lead.findOne({ 'sourceMetadata.googlePlaceId': 'PLACE-INLINE' }).lean();
    expect(String(stored.createdBy)).toBe(String(importer._id));
    expect((await leadRepository.getById(stored._id)).createdBy).toMatchObject({
      firstName: 'Alan', lastName: 'Turing',
    });
  });

  it('discovery import (queued worker): the id travels as a string and still lands as the creator', async () => {
    const importer = await makeUser({ firstName: 'Linus', lastName: 'Torvalds' });
    const sessionId = new mongoose.Types.ObjectId();
    await DiscoveryResult.create([
      makeResultDoc(importer._id, sessionId, 'PLACE-WORKER-1'),
      makeResultDoc(importer._id, sessionId, 'PLACE-WORKER-2'),
    ]);
    const job = await LeadImportJob.create({
      createdBy: importer._id,
      discoverySessionId: sessionId,
      mode: 'new',
      selection: { kind: 'ALL_NEW', resultIds: [] },
      status: 'QUEUED',
      counts: { total: 2 },
    });

    // The queue payload is JSON, so createdBy is a plain string by the time it arrives.
    await new LeadImportWorker().process({
      data: { importJobId: String(job._id), createdBy: String(importer._id) },
      updateProgress: async () => {},
    });

    const stored = await Lead.find({ source: 'google_places' }).lean();
    expect(stored).toHaveLength(2);
    for (const lead of stored) expect(String(lead.createdBy)).toBe(String(importer._id));
  });
});
