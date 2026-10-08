import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// Exercises list search, the business-type filter, and getFilterOptions against
// the REAL data layer (Lead + User models, repository + service, and the real
// userRepository name lookup the service uses to search by assignee/creator).
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let mongod;
let Lead;
let User;
let leadRepository;
let leadService;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Lead = (await import('../lead.model.js')).default;
  User = (await import('../../auth/user.model.js')).default;
  leadRepository = (await import('../lead.repository.js')).default;
  leadService = (await import('../lead.service.js')).default;
  await Lead.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const roleId = new mongoose.Types.ObjectId();
let seq = 0;
let creator;

beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), User.deleteMany({})]);
  creator = await makeUser('Default', 'Creator');
});

async function makeUser(firstName = 'Test', lastName = 'User') {
  seq += 1;
  return User.create({
    email: `u${seq}@example.ch`, passwordHash: 'not-a-real-hash', firstName, lastName, role: roleId,
  });
}

let leadNo = 0;
async function makeLead(overrides = {}) {
  leadNo += 1;
  return Lead.create({
    leadNumber: `L-9${String(leadNo).padStart(5, '0')}`,
    name: `Lead ${leadNo}`,
    type: 'business',
    createdBy: creator._id,
    ...overrides,
  });
}

describe('leadRepository.getFilterOptions', () => {
  it('dedupes places that differ only by case / whitespace and sums their counts', async () => {
    await makeLead({ address: { city: 'Lahore' } });
    await makeLead({ address: { city: 'lahore ' } });
    await makeLead({ address: { city: '  LAHORE' } });
    await makeLead({ address: { city: 'Zurich' } });

    const { places } = await leadRepository.getFilterOptions();

    const lahore = places.filter((p) => p.city.toLocaleLowerCase('en') === 'lahore');
    expect(lahore).toHaveLength(1); // three spellings collapse into one row
    expect(lahore[0].count).toBe(3);
    expect(places.some((p) => p.city === 'Zurich')).toBe(true);
  });

  it('returns distinct business categories with counts, separate from the business/private type facet', async () => {
    await makeLead({ sourceMetadata: { businessType: 'Chinese restaurant' } });
    await makeLead({ sourceMetadata: { businessType: 'Chinese restaurant' } });
    await makeLead({ sourceMetadata: { businessType: 'Hotel' } });

    const { businessTypes, types } = await leadRepository.getFilterOptions();

    expect(businessTypes.find((b) => b.value === 'Chinese restaurant')?.count).toBe(2);
    expect(businessTypes.find((b) => b.value === 'Hotel')?.count).toBe(1);
    // The lead-type facet (business/private) is unchanged and distinct.
    expect(types.find((t) => t.value === 'business')?.count).toBe(3);
  });
});

describe('leadService.list — expanded search', () => {
  it('matches the search term against area and business category', async () => {
    await makeLead({ name: 'Alpha', address: { area: 'Johar Town' } });
    await makeLead({ name: 'Beta', sourceMetadata: { businessType: 'Chinese restaurant' } });
    await makeLead({ name: 'Gamma' });

    const byArea = await leadService.list({ q: 'johar', limit: 25 });
    expect(byArea.data.map((l) => l.name)).toEqual(['Alpha']);

    const byType = await leadService.list({ q: 'chinese', limit: 25 });
    expect(byType.data.map((l) => l.name)).toEqual(['Beta']);
  });

  it('matches the search term against the assignee or creator user name', async () => {
    const salman = await makeUser('Salman', 'Admin');
    const other = await makeUser('Other', 'Person');
    await makeLead({ name: 'Assigned to Salman', assignedTo: salman._id });
    await makeLead({ name: 'Created by Salman', createdBy: salman._id });
    await makeLead({ name: 'Unrelated', assignedTo: other._id });

    const result = await leadService.list({ q: 'salman', limit: 25 });

    expect(new Set(result.data.map((l) => l.name)))
      .toEqual(new Set(['Assigned to Salman', 'Created by Salman']));
  });
});

describe('leadService.list — business-type filter', () => {
  it('filters leads by the exact business category', async () => {
    await makeLead({ name: 'ChineseOne', sourceMetadata: { businessType: 'Chinese restaurant' } });
    await makeLead({ name: 'HotelOne', sourceMetadata: { businessType: 'Hotel' } });

    const result = await leadService.list({ businessType: 'Chinese restaurant', limit: 25 });

    expect(result.data.map((l) => l.name)).toEqual(['ChineseOne']);
  });
});
