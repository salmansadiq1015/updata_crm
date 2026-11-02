import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';

jest.unstable_mockModule('../../src/modules/businessDiscovery/provider/NominatimProvider.js', () => ({
  nominatimProvider: {
    isConfigured: () => true,
    reverseGeocode: jest.fn(async () => ({ result: { address: { city: 'Mohammedia', suburb: 'El Alia', country_code: 'ma' } } })),
  },
}));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let mongo, Lead, repository, migration;
const actor = new mongoose.Types.ObjectId();
let sequence = 0;
const create = (data = {}) => Lead.create({
  name: 'PURE GYM', leadNumber: `L-${String(++sequence).padStart(5, '0')}`, createdBy: actor,
  source: 'extension', sourceMetadata: { importMethod: 'extension' }, ...data,
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  repository = (await import('../../src/modules/crm/lead.repository.js')).default;
  migration = await import('../../src/migrations/038_extension_lead_provenance.js');
  await Lead.init();
}, 60000);
beforeEach(async () => { await Lead.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('persisted extension provenance, idempotency and historical repair', () => {
  it('finds extension place IDs through both duplicate lookup paths', async () => {
    const lead = await create({ sourceMetadata: { importMethod: 'extension', googlePlaceId: 'gym-place' } });
    const duplicates = await repository.findDuplicates({ googlePlaceId: 'gym-place' });
    expect(duplicates.some((match) => String(match.lead._id) === String(lead._id))).toBe(true);
    expect(await repository.findByPlaceIds(['gym-place'])).toHaveLength(1);
    const found = await Lead.find({ source: 'extension' }).lean();
    expect(found).toHaveLength(1);
    expect(found[0].sourceMetadata.importMethod).toBe('extension');
  });

  it('enforces concurrent place-id uniqueness while allowing multiple leads without IDs', async () => {
    const result = await Promise.allSettled([
      create({ sourceMetadata: { googlePlaceId: 'same-place' } }),
      create({ sourceMetadata: { googlePlaceId: 'same-place' } }),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.find((item) => item.status === 'rejected').reason.code).toBe(11000);
    await create(); await create();
    expect(await Lead.countDocuments({ source: 'extension' })).toBe(3);
  });

  it('repairs proven old imports, fills categories/areas, preserves other sources, and is idempotent', async () => {
    const old = await create({
      source: 'import', notes: 'Google Maps: https://www.google.com/maps/place/PURE+GYM',
      tags: ['Gym'], sourceMetadata: { searchLocation: 'Mohammedia, Morocco' },
      address: { city: 'Mohammedia', country: 'MA' }, location: { type: 'Point', coordinates: [-7.38, 33.68] },
    });
    const known = await create({
      source: 'google_places', notes: 'Google Maps address: 12 Boulevard, Mohammedia, Morocco',
      providerMeta: { mapsUrl: 'https://www.google.com/maps/place/Other' },
      sourceMetadata: { googlePlaceId: 'known-place', businessType: 'Fitness center' },
      tags: ['Gym'], address: { city: 'Mohammedia', country: 'MA', area: 'Park Plaza' },
    });
    const ordinary = await create({ source: 'import', notes: 'Imported a spreadsheet', tags: ['Gym'], sourceMetadata: {} });
    await migration.up();
    const fixed = await Lead.findById(old._id).lean();
    expect(fixed).toMatchObject({ source: 'extension', sourceMetadata: { importMethod: 'extension', businessType: 'Gym' }, address: { area: 'El Alia' } });
    expect(fixed.address.geography.areaId).toMatch(/^area:/);
    expect(await Lead.findById(known._id).lean()).toMatchObject({ source: 'extension', sourceMetadata: { businessType: 'Fitness center' }, address: { area: 'Park Plaza' } });
    expect(await Lead.findById(ordinary._id).lean()).toMatchObject({ source: 'import', sourceMetadata: { businessType: null } });
    await migration.up();
    expect(await Lead.findById(old._id).lean()).toEqual(fixed);
  });
});
