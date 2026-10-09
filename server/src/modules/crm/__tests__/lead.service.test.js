import {
  jest, describe, it, beforeAll, afterEach, expect,
} from '@jest/globals';

// ── Mock registrations (before importing the service under test) ──────────────

const mockLeadCreate = jest.fn();
const mockLeadGetById = jest.fn();
const mockLeadUpdate = jest.fn();
const mockLeadSoftDelete = jest.fn();
const mockLeadFindDuplicates = jest.fn();
const mockLeadBulkCreate = jest.fn();
const mockLeadList = jest.fn();
const mockLeadListForMap = jest.fn();

jest.unstable_mockModule('../lead.repository.js', () => ({
  default: {
    create: mockLeadCreate,
    getById: mockLeadGetById,
    update: mockLeadUpdate,
    softDelete: mockLeadSoftDelete,
    findDuplicates: mockLeadFindDuplicates,
    bulkCreate: mockLeadBulkCreate,
    list: mockLeadList,
    listForMap: mockLeadListForMap,
    findByPlaceIds: jest.fn(),
  },
}));

const mockFindIdsByNameOrEmail = jest.fn(async () => []);
jest.unstable_mockModule('../../auth/user.repository.js', () => ({
  default: { findIdsByNameOrEmail: mockFindIdsByNameOrEmail },
}));

const mockGetNextLeadNumber = jest.fn();
jest.unstable_mockModule('../counter.service.js', () => ({
  default: { getNextLeadNumber: mockGetNextLeadNumber },
}));

const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const mockCustomerCreate = jest.fn();
jest.unstable_mockModule('../customer.service.js', () => ({
  default: { create: mockCustomerCreate },
}));

// Dynamically imported inside leadService.geocodeLead — registered here so the
// dynamic import resolves to this mock.
const mockResolveLocation = jest.fn();
jest.unstable_mockModule('../../businessDiscovery/location.service.js', () => ({
  default: { resolveLocation: mockResolveLocation },
}));

let leadService;

beforeAll(async () => {
  leadService = (await import('../lead.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

// Return value that mimics a Mongoose doc (has .toObject()).
function leadDoc(data) {
  return { ...data, _id: 'lead-1', toObject() { return { ...data, _id: 'lead-1' }; } };
}

describe('leadService.create', () => {
  it('allocates an L- number, stores dedup keys + createdBy, and audits', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00042');
    mockLeadFindDuplicates.mockResolvedValue([]);
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    const result = await leadService.create(
      {
        name: 'Müller AG',
        phone: '044 123 45 67',
        website: 'https://www.mueller.ch/kontakt',
        address: { postalCode: '8000' },
      },
      'user-1',
      {},
    );

    expect(mockGetNextLeadNumber).toHaveBeenCalledTimes(1);
    expect(mockLeadCreate).toHaveBeenCalledTimes(1);
    const persisted = mockLeadCreate.mock.calls[0][0];
    expect(persisted).toMatchObject({
      leadNumber: 'L-00042',
      createdBy: 'user-1',
      normalizedPhone: '+41441234567',
      websiteDomain: 'mueller.ch',
    });
    expect(persisted.normalizedName).toBe('muller ag');
    expect(result.leadNumber).toBe('L-00042');
    expect(result.duplicateWarning).toBe(false);
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'lead.created', module: 'lead',
    }));
  });

  it('records the caller as createdBy, whatever the payload says (provenance is not editable)', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00047');
    mockLeadFindDuplicates.mockResolvedValue([]);
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    await leadService.create({ name: 'Foo', createdBy: 'someone-else' }, 'user-1', {});

    expect(mockLeadCreate.mock.calls[0][0].createdBy).toBe('user-1');
  });

  it('flags duplicateWarning when the global dedup check finds candidates', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00043');
    mockLeadFindDuplicates.mockResolvedValue([{ method: 'PHONE', confidence: 0.95, lead: { _id: 'x' } }]);
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    const result = await leadService.create({ name: 'Foo', phone: '+41 44 000 00 00' }, 'user-1', {});

    expect(result.duplicateWarning).toBe(true);
    // dedup check is global (no createdBy scoping passed through)
    expect(mockLeadFindDuplicates).toHaveBeenCalledWith(expect.not.objectContaining({ createdBy: expect.anything() }));
  });

  it('converts a flat { lat, lng } location to a GeoJSON Point before persisting', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00045');
    mockLeadFindDuplicates.mockResolvedValue([]);
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    await leadService.create(
      { name: 'Geo AG', location: { lat: 47.3769, lng: 8.5417 } },
      'user-1',
      {},
    );

    const persisted = mockLeadCreate.mock.calls[0][0];
    // GeoJSON stores coordinates as [lng, lat].
    expect(persisted.location).toEqual({ type: 'Point', coordinates: [8.5417, 47.3769] });
  });

  it('passes a GeoJSON location through unchanged', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00046');
    mockLeadFindDuplicates.mockResolvedValue([]);
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    const location = { type: 'Point', coordinates: [8.5417, 47.3769] };
    await leadService.create({ name: 'GeoJSON AG', location }, 'user-1', {});

    const persisted = mockLeadCreate.mock.calls[0][0];
    expect(persisted.location).toEqual(location);
  });

  it('still creates when the dedup pre-check throws (non-blocking)', async () => {
    mockGetNextLeadNumber.mockResolvedValue('L-00044');
    mockLeadFindDuplicates.mockRejectedValue(new Error('index down'));
    mockLeadCreate.mockImplementation(async (doc) => leadDoc(doc));

    const result = await leadService.create({ name: 'Bar' }, 'user-1', {});

    expect(result.leadNumber).toBe('L-00044');
    expect(result.duplicateWarning).toBe(false);
  });
});

describe('leadService.bulkCreate', () => {
  it('derives dedup keys per doc and delegates to the repository', async () => {
    mockLeadBulkCreate.mockResolvedValue({
      created: [], errors: [], insertedCount: 0, failedCount: 0,
    });

    await leadService.bulkCreate([{ name: 'A', phone: '0442223344' }]);

    const docs = mockLeadBulkCreate.mock.calls[0][0];
    expect(docs[0]).toMatchObject({ name: 'A', normalizedPhone: '+41442223344' });
  });

  it('keeps the createdBy of every doc it is given', async () => {
    mockLeadBulkCreate.mockResolvedValue({
      created: [], errors: [], insertedCount: 0, failedCount: 0,
    });

    await leadService.bulkCreate([
      { name: 'A', leadNumber: 'L-00001', createdBy: 'user-1' },
      { name: 'B', leadNumber: 'L-00002', createdBy: 'user-1' },
    ]);

    const docs = mockLeadBulkCreate.mock.calls[0][0];
    expect(docs.map((doc) => doc.createdBy)).toEqual(['user-1', 'user-1']);
  });
});

describe('leadService reads', () => {
  // The repository populates createdBy / assignedTo; the service must not flatten
  // them back to ids on the way out (the client names the creator from them).
  const creator = { _id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.ch' };

  it('getById returns the lead exactly as the repository populated it', async () => {
    const lead = { _id: 'lead-1', name: 'Foo AG', createdBy: creator };
    mockLeadGetById.mockResolvedValue(lead);

    await expect(leadService.getById('lead-1')).resolves.toBe(lead);
    expect(mockLeadGetById).toHaveBeenCalledWith('lead-1');
  });

  it('list returns the repository page, creator included, with the cursor shape untouched', async () => {
    const page = {
      data: [{ _id: 'lead-1', name: 'Foo AG', createdBy: creator }],
      pagination: { hasNext: false, nextCursor: null, limit: 25 },
    };
    mockLeadList.mockResolvedValue(page);

    await expect(leadService.list({ status: 'new', limit: 25 })).resolves.toBe(page);
    expect(mockLeadList).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, filters: { status: 'new' } }));
  });

  it('listForMap forwards only the filters + search/limit, stripping pagination controls', async () => {
    const mapResult = {
      leads: [{ _id: 'lead-1', name: 'Foo AG', location: { type: 'Point', coordinates: [8.5, 47.3] } }],
      total: 3,
      withLocation: 1,
      withoutLocation: 2,
      limited: false,
    };
    mockLeadListForMap.mockResolvedValue(mapResult);

    await expect(
      leadService.listForMap({
        status: 'new', country: 'CH', city: 'Zürich', area: 'Altstadt', businessType: 'Bakery',
        q: 'foo', limit: 2000,
        cursor: 'abc', sortBy: 'name', sortOrder: 'asc',
      }),
    ).resolves.toBe(mapResult);

    // `q` becomes `search`; cursor/sortBy/sortOrder are not forwarded as filters.
    expect(mockLeadListForMap).toHaveBeenCalledWith({
      filters: {
        status: 'new', country: 'CH', city: 'Zürich', area: 'Altstadt', businessType: 'Bakery',
      },
      search: 'foo',
      searchUserIds: [],
      limit: 2000,
    });
  });

  it('list resolves assignee/creator ids for the search term and forwards them', async () => {
    mockLeadList.mockResolvedValue({ data: [], pagination: { hasNext: false, nextCursor: null, limit: 25 } });
    mockFindIdsByNameOrEmail.mockResolvedValueOnce(['user-1', 'user-2']);

    await leadService.list({ q: 'salman', limit: 25 });

    expect(mockFindIdsByNameOrEmail).toHaveBeenCalledWith('salman', 50);
    expect(mockLeadList).toHaveBeenCalledWith(expect.objectContaining({
      search: 'salman',
      searchUserIds: ['user-1', 'user-2'],
    }));
  });

  it('list never breaks when the user-id lookup throws (search still runs)', async () => {
    mockLeadList.mockResolvedValue({ data: [], pagination: { hasNext: false, nextCursor: null, limit: 25 } });
    mockFindIdsByNameOrEmail.mockRejectedValueOnce(new Error('users down'));

    await expect(leadService.list({ q: 'foo', limit: 25 })).resolves.toBeDefined();
    expect(mockLeadList).toHaveBeenCalledWith(expect.objectContaining({ search: 'foo', searchUserIds: [] }));
  });
});

describe('leadService.convertToCustomer', () => {
  const lead = {
    _id: 'lead-1',
    name: 'Foo AG',
    type: 'business',
    address: {
      street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich', canton: 'ZH', country: 'CH',
    },
    phone: '+41441234567',
    mobile: null,
    email: 'info@foo.ch',
    website: 'https://foo.ch',
    convertedCustomerId: null,
  };

  it('maps the lead → customer payload, links the customer, and audits', async () => {
    mockLeadGetById.mockResolvedValue(lead);
    mockCustomerCreate.mockResolvedValue({ _id: 'cust-1', customerNumber: 'K-00001' });
    mockLeadUpdate.mockResolvedValue({ _id: 'lead-1', status: 'converted', convertedCustomerId: 'cust-1' });

    const result = await leadService.convertToCustomer('lead-1', {}, 'user-1', { ipAddress: '1.2.3.4' });

    expect(mockCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Foo AG',
        type: 'business',
        street: 'Bahnhofstrasse 1',
        postalCode: '8001',
        city: 'Zürich',
        canton: 'ZH',
        country: 'CH',
        phone: '+41441234567',
        email: 'info@foo.ch',
        website: 'https://foo.ch',
      }),
      'user-1',
      expect.any(Object),
    );
    expect(mockLeadUpdate).toHaveBeenCalledWith('lead-1', expect.objectContaining({
      convertedCustomerId: 'cust-1',
      status: 'converted',
      convertedAt: expect.any(Date),
    }));
    expect(result.customerId).toBe('cust-1');
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.converted' }));
  });

  it('blocks a double conversion with LEAD_CONVERT_FAILED', async () => {
    mockLeadGetById.mockResolvedValue({ ...lead, convertedCustomerId: 'cust-existing' });

    await expect(leadService.convertToCustomer('lead-1', {}, 'user-1', {}))
      .rejects.toMatchObject({ statusCode: 409, code: 'LEAD_CONVERT_FAILED' });
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the lead does not exist', async () => {
    mockLeadGetById.mockResolvedValue(null);
    await expect(leadService.convertToCustomer('missing', {}, 'user-1', {}))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('leadService.geocodeLead', () => {
  const addressed = {
    _id: 'lead-1',
    name: 'Foo AG',
    address: { street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich', country: 'CH' },
  };

  it('geocodes the address and stores a GeoJSON Point [lng,lat] on success', async () => {
    mockLeadGetById.mockResolvedValue(addressed);
    mockResolveLocation.mockResolvedValue({ center: { lat: 47.3769, lng: 8.5417 }, formattedAddress: 'Bahnhofstrasse 1, 8001 Zürich' });
    mockLeadUpdate.mockImplementation(async (id, data) => ({ ...addressed, ...data }));

    const result = await leadService.geocodeLead('lead-1', { userId: 'user-1' });

    expect(mockResolveLocation).toHaveBeenCalledWith(expect.stringContaining('Bahnhofstrasse 1'));
    expect(mockLeadUpdate).toHaveBeenCalledWith('lead-1', {
      location: { type: 'Point', coordinates: [8.5417, 47.3769] },
    });
    expect(result.geocoded).toBe(true);
    expect(result.formattedAddress).toBe('Bahnhofstrasse 1, 8001 Zürich');
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.geocoded' }));
  });

  it('skips the geocoder and reports no_address when the lead has nothing locatable', async () => {
    mockLeadGetById.mockResolvedValue({ _id: 'lead-2', name: 'No Address AG', address: { country: 'CH' } });

    const result = await leadService.geocodeLead('lead-2', {});

    expect(result).toMatchObject({ geocoded: false, reason: 'no_address' });
    expect(mockResolveLocation).not.toHaveBeenCalled();
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('never invents a location: reports not_found when the geocoder returns nothing', async () => {
    mockLeadGetById.mockResolvedValue(addressed);
    mockResolveLocation.mockResolvedValue(null);

    const result = await leadService.geocodeLead('lead-1', {});

    expect(result).toMatchObject({ geocoded: false, reason: 'not_found' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('is non-blocking: a provider error reports provider_error instead of throwing', async () => {
    mockLeadGetById.mockResolvedValue(addressed);
    mockResolveLocation.mockRejectedValue(new Error('nominatim down'));

    const result = await leadService.geocodeLead('lead-1', {});

    expect(result).toMatchObject({ geocoded: false, reason: 'provider_error' });
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the lead does not exist', async () => {
    mockLeadGetById.mockResolvedValue(null);
    await expect(leadService.geocodeLead('missing', {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
