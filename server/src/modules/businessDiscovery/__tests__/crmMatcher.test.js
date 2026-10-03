import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../../tests/setup.js';
import { RESULT_MATCHING_STATUS, RESULT_MATCH_METHOD } from '../discoveryResult.model.js';

let Lead;
let Customer;
let crmMatcher;

// Zurich reference + a point ~8 m away (well inside the 150 m geo threshold).
const ZURICH = [8.5417, 47.3769]; // [lng, lat]
const ZURICH_NEAR = [8.5418, 47.3769];
const FAR = [9.5, 47.0]; // ~70 km away

let leadSeq = 0;
let custSeq = 0;
const otherUser = () => new mongoose.Types.ObjectId();

async function seedLead(overrides = {}) {
  leadSeq += 1;
  return Lead.create({
    leadNumber: `L-${String(leadSeq).padStart(5, '0')}`,
    name: overrides.name ?? `Lead ${leadSeq}`,
    createdBy: overrides.createdBy ?? otherUser(),
    source: overrides.source ?? 'manual',
    ...overrides,
  });
}

async function seedCustomer(overrides = {}) {
  custSeq += 1;
  return Customer.create({
    customerNumber: `K-${String(custSeq).padStart(5, '0')}`,
    name: overrides.name ?? `Customer ${custSeq}`,
    type: overrides.type ?? 'business',
    createdBy: overrides.createdBy ?? otherUser(),
    ...overrides,
  });
}

// Minimal normalized business sub-doc. `location` is given as raw [lng, lat] and
// wrapped into GeoJSON; `placeId` is surfaced under `provider.placeId`.
const business = (over = {}) => {
  const { location, placeId, address, ...rest } = over;
  return {
    name: null,
    normalizedName: null,
    normalizedPhone: null,
    websiteDomain: null,
    ...rest,
    address: { postalCode: null, ...(address || {}) },
    location: location ? { type: 'Point', coordinates: location } : null,
    provider: placeId ? { placeId } : undefined,
  };
};

beforeAll(async () => {
  await connectTestDb();
  ({ default: Lead } = await import('../../crm/lead.model.js'));
  ({ default: Customer } = await import('../../crm/customer.model.js'));
  ({ default: crmMatcher } = await import('../engine/crmMatcher.js'));
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('crmMatcher.classify — NEW', () => {
  test('nothing matches → NEW with empty matchedBy', async () => {
    const res = await crmMatcher.classify(business({
      name: 'Totally New Biz',
      normalizedPhone: '+41440000000',
      websiteDomain: 'brand-new-biz.ch',
      placeId: 'NEW_PLACE',
      location: ZURICH,
    }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.NEW);
    expect(res.matchedBy).toEqual([]);
    expect(res.matchedLeadId).toBeUndefined();
    expect(res.matchedCustomerId).toBeUndefined();
  });
});

describe('crmMatcher.classify — EXISTING (strong identity)', () => {
  test('placeId match against a prior lead', async () => {
    const lead = await seedLead({ name: 'PlaceLead', source: 'google_places', sourceMetadata: { googlePlaceId: 'PLACE_XYZ' } });
    const res = await crmMatcher.classify(business({ name: 'Whatever', placeId: 'PLACE_XYZ' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
    expect(res.matchedBy).toContainEqual({ method: RESULT_MATCH_METHOD.PLACE_ID, confidence: 1.0 });
  });

  test('phone match against a prior lead', async () => {
    const lead = await seedLead({ name: 'Lead Phone Co', normalizedPhone: '+41447778899' });
    const res = await crmMatcher.classify(business({ name: 'Unrelated Biz', normalizedPhone: '+41447778899' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
    expect(res.matchedBy).toContainEqual({ method: RESULT_MATCH_METHOD.PHONE, confidence: 0.95 });
  });

  test('phone match against an existing customer (no normalizedPhone column)', async () => {
    const customer = await seedCustomer({ name: 'Nordic Supplies AG', phone: '+41441234567', postalCode: '8000' });
    const res = await crmMatcher.classify(business({ name: 'Zenith Labs', normalizedPhone: '+41441234567' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedCustomerId)).toBe(String(customer._id));
    expect(res.matchedBy).toContainEqual({ method: RESULT_MATCH_METHOD.PHONE, confidence: 0.95 });
  });

  test('phone match against a customer whose number is stored in national form', async () => {
    const customer = await seedCustomer({ name: 'Helvetia Metall', mobile: '0441234567' });
    const res = await crmMatcher.classify(business({ name: 'Zenith Labs', normalizedPhone: '+41441234567' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedCustomerId)).toBe(String(customer._id));
  });

  test('website domain match against a prior lead', async () => {
    const lead = await seedLead({ name: 'WebLead', websiteDomain: 'zenithlabs.ch' });
    const res = await crmMatcher.classify(business({ name: 'NoMatch Inc', websiteDomain: 'zenithlabs.ch' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
    expect(res.matchedBy).toContainEqual({ method: RESULT_MATCH_METHOD.WEBSITE, confidence: 0.9 });
  });
});

describe('crmMatcher.classify — POSSIBLE_DUPLICATE (weak signals)', () => {
  test('name + postal against a lead, confirmed by geo proximity', async () => {
    const lead = await seedLead({
      name: 'Müller AG',
      normalizedName: 'muller ag',
      address: { postalCode: '8001' },
      location: { type: 'Point', coordinates: ZURICH },
    });
    const res = await crmMatcher.classify(business({
      name: 'Müller AG',
      normalizedName: 'muller ag',
      address: { postalCode: '8001' },
      location: ZURICH_NEAR,
    }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
    const methods = res.matchedBy.map((m) => m.method);
    expect(methods).toContain(RESULT_MATCH_METHOD.NAME_ADDRESS);
    expect(methods).toContain(RESULT_MATCH_METHOD.GEO);
    // weak signals never promote to EXISTING
    expect(res.status).not.toBe(RESULT_MATCHING_STATUS.EXISTING);
  });

  test('name + postal against a customer → POSSIBLE_DUPLICATE', async () => {
    const customer = await seedCustomer({ name: 'Alpenblick Gastro GmbH', postalCode: '3000' });
    const res = await crmMatcher.classify(business({
      name: 'Alpenblick Gastro GmbH',
      normalizedName: 'alpenblick gastro gmbh',
      address: { postalCode: '3000' },
    }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE);
    expect(String(res.matchedCustomerId)).toBe(String(customer._id));
    expect(res.matchedBy.map((m) => m.method)).toContain(RESULT_MATCH_METHOD.NAME_ADDRESS);
  });

  test('name match without geo proximity stays POSSIBLE_DUPLICATE but adds no GEO', async () => {
    await seedLead({
      name: 'Far Away Shop',
      normalizedName: 'far away shop',
      address: { postalCode: '8001' },
      location: { type: 'Point', coordinates: FAR },
    });
    const res = await crmMatcher.classify(business({
      name: 'Far Away Shop',
      normalizedName: 'far away shop',
      address: { postalCode: '8001' },
      location: ZURICH,
    }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE);
    expect(res.matchedBy.map((m) => m.method)).not.toContain(RESULT_MATCH_METHOD.GEO);
  });
});

describe('crmMatcher — GLOBAL scope & matchedBy shape', () => {
  test('matches a lead regardless of which user created it (company-wide)', async () => {
    const creator = otherUser();
    const lead = await seedLead({ name: 'OtherUser Lead', createdBy: creator, websiteDomain: 'otheruser.ch' });
    // classify receives no createdBy at all → must still find the lead.
    const res = await crmMatcher.classify(business({ name: 'x', websiteDomain: 'otheruser.ch' }));
    expect(res.status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
  });

  test('matchedBy entries are { method, confidence } with enum method + numeric confidence', async () => {
    await seedLead({ name: 'ShapeLead', normalizedPhone: '+41441119999' });
    const res = await crmMatcher.classify(business({ name: 'q', normalizedPhone: '+41441119999' }));
    expect(Array.isArray(res.matchedBy)).toBe(true);
    for (const entry of res.matchedBy) {
      expect(Object.values(RESULT_MATCH_METHOD)).toContain(entry.method);
      expect(typeof entry.confidence).toBe('number');
    }
  });
});

describe('crmMatcher.classifyBatch', () => {
  test('aligns results to input and batches lookups (placeId / phone / website / name)', async () => {
    const placeLead = await seedLead({ name: 'Batch Place', source: 'google_places', sourceMetadata: { googlePlaceId: 'BP_1' } });
    const phoneLead = await seedLead({ name: 'Batch Phone', normalizedPhone: '+41442223344' });
    await seedCustomer({ name: 'Batch Website Co', phone: '+41559998877' });

    const businesses = [
      business({ name: 'A', placeId: 'BP_1' }), // EXISTING via placeId (lead)
      business({ name: 'B', normalizedPhone: '+41442223344' }), // EXISTING via phone (lead)
      business({ name: 'C Fresh', normalizedPhone: '+41559998877' }), // EXISTING via phone (customer)
      business({ name: 'Totally Unseen Biz', normalizedPhone: '+41440000001' }), // NEW
    ];
    const results = await crmMatcher.classifyBatch(businesses, { placeIds: ['BP_1', undefined, undefined, undefined] });

    expect(results).toHaveLength(4);
    expect(results[0].status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(results[0].matchedLeadId)).toBe(String(placeLead._id));
    expect(results[1].status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(String(results[1].matchedLeadId)).toBe(String(phoneLead._id));
    expect(results[2].status).toBe(RESULT_MATCHING_STATUS.EXISTING);
    expect(results[2].matchedCustomerId).toBeDefined();
    expect(results[3].status).toBe(RESULT_MATCHING_STATUS.NEW);
  });

  test('weak name + geo via the batched normalizedName query', async () => {
    const lead = await seedLead({
      name: 'Seeland Bau',
      normalizedName: 'seeland bau',
      address: { postalCode: '2500' },
      location: { type: 'Point', coordinates: ZURICH },
    });
    const [res] = await crmMatcher.classifyBatch([
      business({ name: 'Seeland Bau', normalizedName: 'seeland bau', address: { postalCode: '2500' }, location: ZURICH_NEAR }),
    ]);
    expect(res.status).toBe(RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE);
    expect(String(res.matchedLeadId)).toBe(String(lead._id));
    const methods = res.matchedBy.map((m) => m.method);
    expect(methods).toContain(RESULT_MATCH_METHOD.NAME_ADDRESS);
    expect(methods).toContain(RESULT_MATCH_METHOD.GEO);
  });

  test('empty input → []', async () => {
    expect(await crmMatcher.classifyBatch([])).toEqual([]);
  });
});
