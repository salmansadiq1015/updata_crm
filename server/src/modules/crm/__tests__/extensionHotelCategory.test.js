import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import request from 'supertest';
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { serve } from '../../../../tests/helpers/serve.js';

jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../leadQuality.hooks.js', () => ({ onLeadsCreated: jest.fn(), onLeadSignalsChanged: jest.fn() }));
jest.unstable_mockModule('../../businessDiscovery/provider/NominatimProvider.js', () => ({ nominatimProvider: { isConfigured: () => false } }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({ leadImportsTotal: { inc: jest.fn() } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({ default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

let mongo, Lead, service, repository, repair, app;
const actor = new mongoose.Types.ObjectId();
const hotel = (i, overrides = {}) => ({
  clientId: `hotel-${i}`, businessName: `Hotel ${i}`, placeIdentifier: `hotel-place-${i}`,
  category: 'Add a label', categories: ['Add a label'], discoveryCategories: ['Hotel'],
  city: 'Lahore', country: 'PK', area: 'Gulberg', ...overrides,
});
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  Lead = (await import('../lead.model.js')).default;
  await import('../../auth/user.model.js');
  service = (await import('../leadImportExport.service.js')).default;
  repository = (await import('../lead.repository.js')).default;
  repair = await import('../../../migrations/044_extension_maps_action_business_type.js');
  await Lead.init();
  const { validate } = await import('../../../shared/validation/validate.js');
  const { bulkImport } = await import('../lead.validation.js');
  app = express(); app.use(express.json());
  app.post('/crm/leads/bulk-import', validate(bulkImport), async (req, res, next) => {
    try { res.json({ data: await service.importExtensionLeads(req.body.leads, actor) }); }
    catch (error) { next(error); }
  });
  app.get('/crm/leads', async (_req, res, next) => {
    try { res.json(await repository.list({ filters: { businessType: 'Hotel' } })); }
    catch (error) { next(error); }
  });
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
});
beforeEach(async () => { await Lead.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

describe('selected Hotel → HTTP import → MongoDB → CRM list/filter', () => {
  it.each([1, 10])('preserves Hotel for %i selected leads, including old action-polluted payloads', async (count) => {
    const res = await request(serve(app)).post('/crm/leads/bulk-import').send({ leads: Array.from({ length: count }, (_, i) => hotel(i)) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: count, created: count, failed: 0 });
    const list = await request(serve(app)).get('/crm/leads');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(count);
    for (const lead of list.body.data) {
      expect(lead.sourceMetadata.businessType).toBe('Hotel');
      expect(lead.sourceMetadata.discoveryBusinessTypes).toEqual(['Hotel']);
    }
    const options = await repository.getFilterOptions();
    expect(options.businessTypes).toEqual([{ value: 'Hotel', count }]);
  });
  it('repairs an existing lead on re-import and fills missing discovery provenance', async () => {
    const existing = await Lead.create({ name: 'Gulberg Inn Hotel', leadNumber: 'L-EXISTING', source: 'extension', createdBy: actor, sourceMetadata: { googlePlaceId: 'hotel-place-1', businessType: 'Add a label' } });
    const result = await service.importExtensionLeads([hotel(1, { businessName: existing.name })], actor);
    expect(result).toMatchObject({ existing: 1, created: 0, failed: 0 });
    expect((await Lead.findById(existing._id).lean()).sourceMetadata).toMatchObject({ businessType: 'Hotel', discoveryBusinessTypes: ['Hotel'] });
    expect(await Lead.countDocuments()).toBe(1);
  });
  it('repairs old categories through bulk re-import without creating copies', async () => {
    const leads = [hotel(1), hotel(2)];
    await Lead.create(leads.map((row, i) => ({ name: row.businessName, leadNumber: `L-OLD-${i}`, source: 'extension', createdBy: actor, sourceMetadata: { googlePlaceId: row.placeIdentifier, businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } })));
    const result = await service.importExtensionLeads(leads, actor);
    expect(result).toMatchObject({ created: 0, existing: 2, failed: 0 });
    expect((await Lead.find({}).lean()).every((lead) => lead.sourceMetadata.businessType === 'Hotel')).toBe(true);
  });
  it('preserves per-lead categories in a mixed campaign and a more specific real category', async () => {
    await service.importExtensionLeads([hotel(1), hotel(2, { discoveryCategories: ['Restaurant'] }), hotel(3, { category: 'Boutique hotel' })], actor);
    expect((await Lead.find({}).sort({ name: 1 }).lean()).map((lead) => lead.sourceMetadata.businessType)).toEqual(['Hotel', 'Restaurant', 'Boutique hotel']);
  });
  it('preserves Hotel through the CSV fallback mapping', async () => {
    const payload = JSON.stringify(hotel(1)).replace(/"/g, '""');
    const result = await service.importLeads({ source: 'extension', mimetype: 'text/csv', originalname: 'extension.csv', buffer: Buffer.from(`name,extensionRecord\r\nHotel,"${payload}"\r\n`) }, actor);
    expect(result.summary.created).toBe(1);
    expect((await Lead.findOne({}).lean()).sourceMetadata.businessType).toBe('Hotel');
  });
  it('repairs history idempotently using saved evidence, without guessing or touching manual/deleted leads', async () => {
    const data = [
      { name: 'Affected', source: 'extension', sourceMetadata: { businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } },
      { name: 'Missing', source: 'extension', sourceMetadata: { businessType: null, discoveryBusinessTypes: [{ id: 'hotel', name: 'Hotel' }] } },
      { name: 'Correct', source: 'extension', sourceMetadata: { businessType: 'Boutique hotel', discoveryBusinessTypes: ['Hotel'] } },
      { name: 'Manual', source: 'manual', sourceMetadata: { businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } },
      { name: 'Unrecoverable Hotel', source: 'extension', sourceMetadata: { businessType: 'Add a label' } },
      { name: 'Deleted', source: 'extension', isDeleted: true, sourceMetadata: { businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } },
      { name: 'Legacy', source: 'import', notes: 'Google Maps: https://www.google.com/maps/place/Hotel', sourceMetadata: { businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } },
    ];
    await Lead.create(data.map((lead, i) => ({ ...lead, leadNumber: `L-REPAIR-${i}`, createdBy: actor })));
    expect(await repair.up()).toEqual({ repaired: 3, unrecoverable: 1 });
    const stored = await Lead.collection.find({}).sort({ leadNumber: 1 }).toArray();
    expect(stored.map((lead) => lead.sourceMetadata.businessType)).toEqual(['Hotel', 'Hotel', 'Boutique hotel', 'Add a label', 'Add a label', 'Add a label', 'Hotel']);
    expect(await repair.up()).toEqual({ repaired: 0, unrecoverable: 1 });
    expect(await Lead.collection.find({}).sort({ leadNumber: 1 }).toArray()).toEqual(stored);
  });
});
