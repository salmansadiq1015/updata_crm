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

// Legacy rows written by older code paths bypass the model's canonicalizing
// save hook — exactly the inconsistent data the filters must still merge.
async function insertRaw(address, extra = {}) {
  leadNo += 1;
  const doc = {
    leadNumber: `L-8${String(leadNo).padStart(5, '0')}`,
    name: `Raw ${leadNo}`,
    type: 'business',
    status: 'new',
    source: 'import',
    isDeleted: false,
    createdBy: creator._id,
    createdAt: new Date(),
    updatedAt: new Date(),
    address,
    ...extra,
  };
  const { insertedId } = await Lead.collection.insertOne(doc);
  return insertedId;
}

const values = (options) => options.map((option) => option.value);

describe('canonical, de-duplicated geography filters (legacy raw data)', () => {
  it('shows Lahore once whether stored as "Lahore", "lahore ", "Lahore, Pakistan" or "Lahore Pakistan"', async () => {
    await insertRaw({ country: 'PK', city: 'Lahore' });
    await insertRaw({ country: 'PK', city: 'lahore ' });
    await insertRaw({ country: 'PK', city: 'Lahore, Pakistan' });
    await insertRaw({ country: 'PK', city: 'Lahore Pakistan', area: 'Bahria Town' });
    const { cities } = await leadRepository.getFilterOptions();
    expect(values(cities)).toEqual(['Lahore']);
    expect(cities[0]).toMatchObject({ countryCode: 'PK', count: 4 });

    const listed = await leadRepository.list({ filters: { cityId: cities[0].id }, limit: 50 });
    expect(listed.pagination.total).toBe(4);
  });

  it('merges a bilingual label with its English spelling (Mohammédia المحمدية = Mohammedia) and shows it in Latin script', async () => {
    await insertRaw({ country: 'MA', city: 'Mohammédia المحمدية' });
    await insertRaw({ country: 'MA', city: 'Mohammédia المحمدية', area: 'Centre' });
    await insertRaw({ country: 'MA', city: 'Mohammedia' });
    await insertRaw({ country: 'MA', city: 'Bni Yakhlef ⴱⵏⵉ ⵉⵅⵍⴼ بني يخلف' });
    const { cities } = await leadRepository.getFilterOptions();
    expect(values(cities)).toEqual(['Bni Yakhlef', 'Mohammédia']);
    expect(cities.find((c) => c.value === 'Mohammédia').count).toBe(3);
    expect(cities.every((c) => !/[\u0600-\u06FF\u2D30-\u2D7F]/u.test(c.value))).toBe(true);
  });

  it('keeps Paris as ONE city and its arrondissements as distinct areas of Paris', async () => {
    await insertRaw({ country: 'FR', city: 'Paris' });
    await insertRaw({ country: 'FR', city: 'Paris', area: '10th Arrondissement' });
    await insertRaw({ country: 'FR', city: 'Paris 10th Arrondissement' });
    await insertRaw({ country: 'FR', city: 'Paris', area: '10th arrondissement of Paris' });
    await insertRaw({ country: 'FR', city: 'Paris', area: '11th Arrondissement' });
    const { cities } = await leadRepository.getFilterOptions();
    expect(values(cities)).toEqual(['Paris']);
    expect(cities[0].count).toBe(5);

    const scoped = await leadRepository.getFilterOptions({ filters: { countryId: 'country:FR', cityId: cities[0].id } });
    expect(values(scoped.areas)).toEqual(['10th Arrondissement', '11th Arrondissement']);
    const tenth = scoped.areas.find((a) => a.value === '10th Arrondissement');
    expect(tenth.count).toBe(3);

    const tenthLeads = await leadRepository.list({ filters: { cityId: cities[0].id, areaId: tenth.id }, limit: 50 });
    expect(tenthLeads.pagination.total).toBe(3);
    const allParis = await leadRepository.list({ filters: { cityId: cities[0].id }, limit: 50 });
    expect(allParis.pagination.total).toBe(5);
  });

  it('keeps identically named cities in different countries apart, labelled by country', async () => {
    await insertRaw({ country: 'FR', city: 'Paris' });
    await insertRaw({ country: 'US', city: 'Paris' });
    const { cities } = await leadRepository.getFilterOptions();
    expect(values(cities)).toEqual(['Paris · France', 'Paris · United States']);
    const usOnly = await leadRepository.getFilterOptions({ filters: { countryId: 'country:US' } });
    expect(values(usOnly.cities)).toEqual(['Paris']);
  });

  it('folds a country-less "Paris" into the only known Paris so no lead drops out of the filter', async () => {
    await insertRaw({ country: 'FR', city: 'Paris' });
    await insertRaw({ country: null, city: 'Paris' });
    const { cities, countries } = await leadRepository.getFilterOptions();
    expect(values(cities)).toEqual(['Paris']);
    expect(cities[0].count).toBe(2);
    expect(countries).toEqual([expect.objectContaining({ code: 'FR', count: 2 })]);
    const viaCountry = await leadRepository.list({ filters: { countryId: 'country:FR' }, limit: 50 });
    expect(viaCountry.pagination.total).toBe(2);
    const viaCity = await leadRepository.list({ filters: { cityId: cities[0].id }, limit: 50 });
    expect(viaCity.pagination.total).toBe(2);
  });

  it('never shows Lahore areas under Paris (cascade) and an unknown id matches nothing', async () => {
    await insertRaw({ country: 'FR', city: 'Paris', area: '4th Arrondissement' });
    await insertRaw({ country: 'PK', city: 'Lahore', area: 'Johar Town' });
    const { cities } = await leadRepository.getFilterOptions();
    const paris = cities.find((c) => c.value === 'Paris');
    const parisOnly = await leadRepository.getFilterOptions({ filters: { countryId: 'country:FR', cityId: paris.id } });
    expect(values(parisOnly.areas)).toEqual(['4th Arrondissement']);
    const none = await leadRepository.list({ filters: { cityId: 'city:does-not-exist' }, limit: 50 });
    expect(none.pagination.total).toBe(0);
  });
});

describe('leadRepository.getFilterOptions', () => {
  it('returns separate country, city and area facets and scopes duplicate names by their parent location', async () => {
    await makeLead({ address: { country: 'PK', city: 'Lahore', area: 'Gulberg' } });
    await makeLead({ address: { country: 'PK', city: 'lahore ', area: 'gulberg ' } });
    await makeLead({ address: { country: 'FR', city: 'Paris', area: 'Centre' } });
    await makeLead({ address: { country: 'CH', city: 'Lausanne', area: 'Centre' } });
    await makeLead({ address: { country: 'CH', city: '8001', area: '8001' } });

    const { countries, cities, areas } = await leadRepository.getFilterOptions();

    expect(countries.map(({ code, count }) => ({ code, count }))).toEqual(expect.arrayContaining([
      { code: 'CH', count: 2 },
      { code: 'FR', count: 1 },
      { code: 'PK', count: 2 },
    ]));
    const lahore = cities.find((option) => option.value === 'Lahore');
    const paris = cities.find((option) => option.value === 'Paris');
    const lausanne = cities.find((option) => option.value === 'Lausanne');
    expect(lahore).toMatchObject({ countryCode: 'PK', countryId: 'country:PK', count: 2 });
    expect(paris).toMatchObject({ countryCode: 'FR', countryId: 'country:FR', count: 1 });
    expect(lausanne).toMatchObject({ countryCode: 'CH', countryId: 'country:CH', count: 1 });
    expect(cities.some((option) => option.value === '8001')).toBe(false);
    // The same area label in two cities stays as two scoped options.
    expect(areas.find((option) => option.value === 'Gulberg')).toMatchObject({
      cityId: lahore.id, countryId: 'country:PK', count: 2,
    });
    // The same area label in two cities stays two scoped options, labelled by
    // their city so the list never shows the same word twice.
    expect(areas.filter((option) => option.value.startsWith('Centre'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'Centre · Paris', cityId: paris.id, countryId: 'country:FR', count: 1 }),
      expect.objectContaining({ value: 'Centre · Lausanne', cityId: lausanne.id, countryId: 'country:CH', count: 1 }),
    ]));
    expect(areas.some((option) => option.value === '8001')).toBe(false);

    const pakistanOnly = await leadRepository.getFilterOptions({ filters: { countryId: 'country:PK' } });
    expect(pakistanOnly.cities.map((option) => option.value)).toEqual(['Lahore']);
    expect(pakistanOnly.areas.map((option) => option.value)).toEqual(['Gulberg']);
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

describe('leadService.list — address geography filters', () => {
  it('combines country, city and area using normalized exact matches', async () => {
    await makeLead({
      name: 'Paris Centre Hotel',
      address: { country: 'FR', city: 'Paris', area: '1er arrondissement' },
    });
    await makeLead({
      name: 'Paris Outer Hotel',
      address: { country: 'FR', city: 'Paris', area: 'Montmartre' },
    });
    await makeLead({
      name: 'Lahore Hotel',
      address: { country: 'PK', city: 'Lahore', area: 'Gulberg' },
      sourceMetadata: { discoveryLocation: { city: 'Paris', countryCode: 'FR' } },
    });

    const result = await leadService.list({
      country: ' fr ', city: ' paris ', area: '1ER ARRONDISSEMENT', limit: 25,
    });

    expect(result.data.map((lead) => lead.name)).toEqual(['Paris Centre Hotel']);
  });

  it('does not treat the discovery search location as the business city', async () => {
    await makeLead({
      name: 'Actually Lahore',
      address: { country: 'PK', city: 'Lahore', area: 'Gulberg' },
      sourceMetadata: { discoveryLocation: { name: 'Paris', city: 'Paris', countryCode: 'FR' } },
    });

    const paris = await leadService.list({ country: 'FR', city: 'Paris', limit: 25 });
    const lahore = await leadService.list({ country: 'PK', city: 'Lahore', limit: 25 });

    expect(paris.data).toEqual([]);
    expect(lahore.data.map((lead) => lead.name)).toEqual(['Actually Lahore']);
  });
});
