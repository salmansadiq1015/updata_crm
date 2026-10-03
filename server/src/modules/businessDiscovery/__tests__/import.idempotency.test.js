import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// Real data layer (Lead model + unique partial index, discovery repository,
// counter). Only the peripheral services are mocked so the test can run without
// Redis / Prometheus and still exercise the REAL idempotency guarantees:
//  - the unique partial googlePlaceId index on leads, and
//  - the atomic per-result import claim.
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../notifications/notification.service.js', () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({ leadImportsTotal: { inc: jest.fn() } }));
// Place-details enrichment is exercised in detailsEnricher.test.js; here it is a
// no-op so this suite stays focused on the real idempotency guarantees (and so the
// Google provider + its metrics are kept out of this suite's module graph).
jest.unstable_mockModule('../engine/detailsEnricher.js', () => ({
  enrichResultWithDetails: jest.fn(async (result) => ({ result, fetched: false })),
  default: { enrichResultWithDetails: jest.fn(async (result) => ({ result, fetched: false })) },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let mongod;
let importService;
let DiscoveryResult;
let RESULT_MATCHING_STATUS;
let RESULT_IMPORT_STATUS;
let Lead;

const user = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  importService = (await import('../import.service.js')).default;
  ({ default: DiscoveryResult, RESULT_MATCHING_STATUS, RESULT_IMPORT_STATUS } = await import('../discoveryResult.model.js'));
  Lead = (await import('../../crm/lead.model.js')).default;

  // Build indexes (unique partial googlePlaceId on leads; {session,place} on results).
  await Promise.all([Lead.init(), DiscoveryResult.init()]);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([DiscoveryResult.deleteMany({}), Lead.deleteMany({})]);
});

function makeResultDoc(sessionId, placeId) {
  return {
    createdBy: user,
    discoverySessionId: sessionId,
    provider: { name: 'google_places', placeId },
    business: {
      name: 'Duplicate Biz',
      address: {
        street: 'Bahnhofstrasse 1', city: 'Zürich', postalCode: '8001', canton: 'ZH', country: 'CH',
      },
      phone: '+41441112233',
      website: 'https://dup.ch',
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    },
    matching: { status: RESULT_MATCHING_STATUS.NEW },
    import: { status: RESULT_IMPORT_STATUS.NOT_IMPORTED },
    discoveryContext: { businessTypeIds: ['restaurant'], keyword: 'pizza' },
  };
}

describe('import idempotency (real unique index + atomic claim)', () => {
  it('the unique googlePlaceId index prevents duplicate leads across a batch', async () => {
    // Same place discovered in two different sessions (allowed at the result
    // level; the result unique index is per {session, placeId}).
    const r1 = await DiscoveryResult.create(makeResultDoc(new mongoose.Types.ObjectId(), 'PLACE-DUP'));
    const r2 = await DiscoveryResult.create(makeResultDoc(new mongoose.Types.ObjectId(), 'PLACE-DUP'));

    const summary = await importService.processBatch(
      [r1.toObject(), r2.toObject()],
      { mode: 'new' },
      user,
    );

    expect(summary.imported).toBe(1);
    expect(summary.duplicates).toBe(1);

    const leadCount = await Lead.countDocuments({ 'sourceMetadata.googlePlaceId': 'PLACE-DUP' });
    expect(leadCount).toBe(1);

    const after = await DiscoveryResult.findById(r2._id).lean();
    expect(after.import.status).toBe('SKIPPED');
    expect(after.import.leadId).toBeTruthy();
  });

  it('a repeated import of the same result creates no second lead (atomic claim)', async () => {
    const r1 = await DiscoveryResult.create(makeResultDoc(new mongoose.Types.ObjectId(), 'PLACE-ONCE'));

    const first = await importService.processBatch([r1.toObject()], { mode: 'new' }, user);
    expect(first.imported).toBe(1);

    // Reload (now IMPORTED) and run again — the NOT_IMPORTED → QUEUED claim misses.
    const reloaded = await DiscoveryResult.findById(r1._id).lean();
    const second = await importService.processBatch([reloaded], { mode: 'new' }, user);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);

    const leadCount = await Lead.countDocuments({ 'sourceMetadata.googlePlaceId': 'PLACE-ONCE' });
    expect(leadCount).toBe(1);
  });
});
