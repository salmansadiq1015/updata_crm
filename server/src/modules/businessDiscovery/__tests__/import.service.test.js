import {
  jest, describe, it, beforeAll, beforeEach, expect,
} from '@jest/globals';

// ── Mock registrations (before importing the service under test) ──────────────

const mockFindResultsForImport = jest.fn();
const mockUpdateResultImportStatus = jest.fn();
const mockGetResultById = jest.fn();
jest.unstable_mockModule('../discovery.repository.js', () => ({
  default: {
    findResultsForImport: mockFindResultsForImport,
    updateResultImportStatus: mockUpdateResultImportStatus,
    getResultById: mockGetResultById,
  },
}));

const mockLeadImportJobCreate = jest.fn();
jest.unstable_mockModule('../leadImportJob.model.js', () => ({
  default: { create: mockLeadImportJobCreate },
  LEAD_IMPORT_MODE: { NEW: 'new', SKIP: 'skip', UPDATE: 'update' },
  LEAD_IMPORT_SELECTION_KIND: { ALL_NEW: 'ALL_NEW', SELECTED: 'SELECTED' },
  LEAD_IMPORT_JOB_STATUS: {
    QUEUED: 'QUEUED', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', PARTIAL: 'PARTIAL', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
  },
}));

const mockAddJob = jest.fn();
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockAddJob },
}));

const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

const mockMetricInc = jest.fn();
jest.unstable_mockModule('../../../metrics/index.js', () => ({
  leadImportsTotal: { inc: mockMetricInc },
}));

// Deferred Place-details enrichment (tested on its own in detailsEnricher.test.js).
// Mocked here so processBatch logic is tested in isolation and the Google provider
// + its metrics never enter this suite's module graph. Returns the result as-is.
const mockEnrich = jest.fn(async (result) => ({ result, fetched: false }));
jest.unstable_mockModule('../engine/detailsEnricher.js', () => ({
  enrichResultWithDetails: mockEnrich,
  default: { enrichResultWithDetails: mockEnrich },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const mockLeadServiceCreate = jest.fn();
const mockLeadServiceUpdate = jest.fn();
jest.unstable_mockModule('../../crm/lead.service.js', () => ({
  default: { create: mockLeadServiceCreate, update: mockLeadServiceUpdate },
}));

const mockFindByPlaceIds = jest.fn();
jest.unstable_mockModule('../../crm/lead.repository.js', () => ({
  default: { findByPlaceIds: mockFindByPlaceIds },
}));

let importService;
let SYNC_THRESHOLD;

beforeAll(async () => {
  const mod = await import('../import.service.js');
  importService = mod.default;
  SYNC_THRESHOLD = mod.SYNC_THRESHOLD;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateResultImportStatus.mockResolvedValue({ claimed: true });
  mockFindByPlaceIds.mockResolvedValue([]);
  mockLeadServiceCreate.mockResolvedValue({ _id: 'lead-created' });
  mockLeadServiceUpdate.mockResolvedValue({ _id: 'lead-updated' });
});

function makeResult(overrides = {}) {
  return {
    _id: overrides._id || 'res-1',
    discoverySessionId: 'sess-1',
    provider: { placeId: overrides.placeId || 'place-1' },
    business: {
      name: 'Pizzeria Bella',
      address: {
        street: 'Bahnhofstrasse 1', city: 'Zürich', postalCode: '8001', canton: 'ZH', country: 'CH',
      },
      phone: '+41441234567',
      email: null,
      website: 'https://bella.ch',
      location: { type: 'Point', coordinates: [8.54, 47.37] },
      rating: 4.5,
      reviewCount: 120,
      priceLevel: 'MODERATE',
    },
    matching: { status: overrides.matching || 'NEW', matchedLeadId: overrides.matchedLeadId || null },
    import: { status: overrides.import || 'NOT_IMPORTED' },
    discoveryContext: { businessTypeIds: ['restaurant'], keyword: 'pizza' },
    discoveredAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('computeEligibility / preview — counts by mode', () => {
  const results = [
    makeResult({ _id: 'r1', matching: 'NEW', import: 'NOT_IMPORTED' }),
    makeResult({ _id: 'r2', matching: 'EXISTING', import: 'NOT_IMPORTED' }),
    makeResult({ _id: 'r3', matching: 'POSSIBLE_DUPLICATE', import: 'NOT_IMPORTED' }),
    makeResult({ _id: 'r4', matching: 'NEW', import: 'IMPORTED' }),
  ];

  it('new mode: willImport counts only NEW + NOT_IMPORTED', async () => {
    mockFindResultsForImport.mockResolvedValue(results);
    const counts = await importService.preview('sess-1', { mode: 'new' }, 'user-1');
    expect(counts).toEqual({
      total: 4, new: 2, existing: 1, possibleDuplicates: 1, willImport: 1,
    });
  });

  it('update mode: willImport counts NEW + EXISTING not yet imported', async () => {
    mockFindResultsForImport.mockResolvedValue(results);
    const counts = await importService.preview('sess-1', { mode: 'update' }, 'user-1');
    expect(counts.willImport).toBe(2); // r1 (NEW) + r2 (EXISTING), both NOT_IMPORTED
  });

  it('scopes results by createdBy and passes selection ids when SELECTED', async () => {
    mockFindResultsForImport.mockResolvedValue([]);
    await importService.preview('sess-1', { mode: 'new', selection: { kind: 'SELECTED', resultIds: ['a', 'b'] } }, 'user-7');
    expect(mockFindResultsForImport).toHaveBeenCalledWith('sess-1', {
      mode: 'new', resultIds: ['a', 'b'], createdBy: 'user-7',
    });
  });
});

describe('processBatch — sync import flips result status + maps the DTO', () => {
  it('claims NOT_IMPORTED → QUEUED, creates the lead, then marks IMPORTED', async () => {
    const r = makeResult({ _id: 'res-1', matching: 'NEW', import: 'NOT_IMPORTED' });
    mockLeadServiceCreate.mockResolvedValue({ _id: 'lead-9' });

    const summary = await importService.processBatch([r], { mode: 'new' }, 'user-1');

    expect(summary).toMatchObject({ imported: 1, failed: 0, total: 1 });
    expect(mockUpdateResultImportStatus).toHaveBeenNthCalledWith(1, 'res-1', 'QUEUED', {
      expectedStatus: 'NOT_IMPORTED', createdBy: 'user-1',
    });
    expect(mockUpdateResultImportStatus).toHaveBeenNthCalledWith(2, 'res-1', 'IMPORTED', expect.objectContaining({
      set: expect.objectContaining({ 'import.leadId': 'lead-9' }),
    }));

    const dto = mockLeadServiceCreate.mock.calls[0][0];
    expect(dto).toMatchObject({
      name: 'Pizzeria Bella',
      type: 'business',
      source: 'google_places',
      mobile: null,
      sourceMetadata: expect.objectContaining({
        googlePlaceId: 'place-1',
        discoveryResultId: 'res-1',
        discoverySessionId: 'sess-1',
        keyword: 'pizza',
        businessType: 'restaurant',
      }),
    });
    expect(dto.location).toEqual({ type: 'Point', coordinates: [8.54, 47.37] });
    expect(mockMetricInc).toHaveBeenCalledWith({ result: 'imported' });
  });

  it('fetches Place Details (DETAILS_IMPORT) for a result missing them before creating the lead', async () => {
    const r = makeResult({ _id: 'res-2', matching: 'NEW', import: 'NOT_IMPORTED' });
    mockLeadServiceCreate.mockResolvedValue({ _id: 'lead-2' });

    await importService.processBatch([r], { mode: 'new' }, 'user-1');

    // Bulk "Add All New" of a never-opened result still enriches contact fields.
    expect(mockEnrich).toHaveBeenCalledWith(r, { fieldProfile: 'DETAILS_IMPORT', createdBy: 'user-1' });
  });
});

describe('processBatch — double import is idempotent (no duplicate leads)', () => {
  it('skips when the atomic claim misses (already claimed elsewhere)', async () => {
    const r = makeResult({ _id: 'res-1' });
    mockUpdateResultImportStatus.mockResolvedValueOnce(null); // claim loses the race

    const summary = await importService.processBatch([r], { mode: 'new' }, 'user-1');

    expect(summary).toMatchObject({ skipped: 1, imported: 0 });
    expect(mockLeadServiceCreate).not.toHaveBeenCalled();
    expect(mockMetricInc).toHaveBeenCalledWith({ result: 'skipped' });
  });

  it('on a duplicate-key (unique googlePlaceId), links the existing lead and skips', async () => {
    const r = makeResult({ _id: 'res-1', placeId: 'place-1' });
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    mockLeadServiceCreate.mockRejectedValue(dupErr);
    mockFindByPlaceIds.mockResolvedValue([{ _id: 'existing-lead' }]);

    const summary = await importService.processBatch([r], { mode: 'new' }, 'user-1');

    expect(summary).toMatchObject({ duplicates: 1, imported: 0 });
    expect(mockUpdateResultImportStatus).toHaveBeenLastCalledWith('res-1', 'SKIPPED', expect.objectContaining({
      set: expect.objectContaining({ 'import.leadId': 'existing-lead' }),
    }));
  });
});

describe('processBatch — mode new vs skip vs update', () => {
  it('new: existing match is skipped (never creates a duplicate lead)', async () => {
    const r = makeResult({ _id: 'res-1', matching: 'EXISTING', matchedLeadId: 'lead-existing' });
    const summary = await importService.processBatch([r], { mode: 'new' }, 'user-1');

    expect(summary).toMatchObject({ existing: 1, imported: 0 });
    expect(mockLeadServiceCreate).not.toHaveBeenCalled();
    expect(mockUpdateResultImportStatus).toHaveBeenLastCalledWith('res-1', 'SKIPPED', expect.objectContaining({
      set: expect.objectContaining({ 'import.leadId': 'lead-existing' }),
    }));
  });

  it('skip: behaves like new (existing skipped, new created)', async () => {
    const existing = makeResult({ _id: 'res-e', matching: 'EXISTING', matchedLeadId: 'lead-e' });
    const fresh = makeResult({ _id: 'res-n', matching: 'NEW' });
    const summary = await importService.processBatch([existing, fresh], { mode: 'skip' }, 'user-1');

    expect(summary).toMatchObject({ existing: 1, imported: 1 });
    expect(mockLeadServiceCreate).toHaveBeenCalledTimes(1);
  });

  it('update: existing match refreshes the linked lead', async () => {
    const r = makeResult({ _id: 'res-1', matching: 'EXISTING', matchedLeadId: 'lead-existing' });
    const summary = await importService.processBatch([r], { mode: 'update' }, 'user-1');

    expect(summary).toMatchObject({ imported: 1, existing: 0 });
    expect(mockLeadServiceUpdate).toHaveBeenCalledWith('lead-existing', expect.objectContaining({ name: 'Pizzeria Bella' }), expect.any(Object));
    expect(mockLeadServiceCreate).not.toHaveBeenCalled();
    expect(mockUpdateResultImportStatus).toHaveBeenLastCalledWith('res-1', 'IMPORTED', expect.objectContaining({
      set: expect.objectContaining({ 'import.leadId': 'lead-existing' }),
    }));
  });
});

describe('importFromSession — sync vs queued', () => {
  it('runs inline and returns a summary when eligible ≤ SYNC_THRESHOLD', async () => {
    mockFindResultsForImport.mockResolvedValue([makeResult({ _id: 'r1', matching: 'NEW' })]);
    mockLeadServiceCreate.mockResolvedValue({ _id: 'lead-1' });

    const result = await importService.importFromSession('sess-1', { mode: 'new', selection: { kind: 'ALL_NEW' } }, 'user-1', {});

    expect(result.jobId).toBeUndefined();
    expect(result.summary).toMatchObject({ imported: 1, total: 1 });
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('enqueues a LeadImportJob and returns { jobId } when eligible > SYNC_THRESHOLD', async () => {
    const many = Array.from({ length: SYNC_THRESHOLD + 5 }, (_, i) => makeResult({ _id: `r${i}`, placeId: `p${i}`, matching: 'NEW' }));
    mockFindResultsForImport.mockResolvedValue(many);
    mockLeadImportJobCreate.mockResolvedValue({ _id: 'job-1' });

    const result = await importService.importFromSession('sess-1', { mode: 'new', selection: { kind: 'ALL_NEW' } }, 'user-1', {});

    expect(result).toEqual({ jobId: 'job-1' });
    expect(mockLeadImportJobCreate).toHaveBeenCalledWith(expect.objectContaining({
      createdBy: 'user-1',
      discoverySessionId: 'sess-1',
      mode: 'new',
      status: 'QUEUED',
      counts: { total: SYNC_THRESHOLD + 5 },
    }));
    expect(mockAddJob).toHaveBeenCalledWith('lead-import', 'lead-import-job-1', expect.objectContaining({
      importJobId: 'job-1', createdBy: 'user-1',
    }));
    expect(mockLeadServiceCreate).not.toHaveBeenCalled(); // not processed inline
  });
});

describe('importResult — Add One', () => {
  it('imports a single result', async () => {
    mockGetResultById.mockResolvedValue(makeResult({ _id: 'res-1', matching: 'NEW' }));
    mockLeadServiceCreate.mockResolvedValue({ _id: 'lead-1' });

    const result = await importService.importResult('res-1', { mode: 'new' }, 'user-1', {});

    expect(result.summary).toMatchObject({ imported: 1, total: 1 });
    expect(mockGetResultById).toHaveBeenCalledWith('res-1', { createdBy: 'user-1' });
  });

  it('throws NotFoundError when the result does not exist', async () => {
    mockGetResultById.mockResolvedValue(null);
    await expect(importService.importResult('missing', { mode: 'new' }, 'user-1', {}))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
