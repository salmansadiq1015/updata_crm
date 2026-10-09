import {
  jest,
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
} from '@jest/globals';

// ── All mock registrations must precede importing the worker under test ──

jest.unstable_mockModule('../../../shared/queue/BaseWorker.js', () => ({
  BaseWorker: class BaseWorker {
    constructor(name) { this.name = name; }
    async process(_job) { throw new Error('process() not implemented'); }
    async isAlreadyDone(_job) { return false; }
    getHandler() { return async (job) => this.process(job); }
  },
}));

jest.unstable_mockModule('../../../config/index.js', () => ({
  default: {
    discovery: {
      maxResults: 200,
      maxSearchRequests: 50,
      maxCoverageCells: 25,
      concurrency: 3,
      initialResultLimit: 300,
      resultTtlDays: 30,
    },
  },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockSearchesInc = jest.fn();
const mockResultsInc = jest.fn();
const mockObserve = jest.fn();
jest.unstable_mockModule('../../../metrics/index.js', () => ({
  discoverySearchesTotal: { inc: mockSearchesInc },
  discoveryResultsDiscoveredTotal: { inc: mockResultsInc },
  discoveryRunDuration: { observe: mockObserve },
}));

const repo = {
  getSessionById: jest.fn(),
  setSessionStatus: jest.fn(),
  updateSessionProgress: jest.fn(),
  bulkUpsertResults: jest.fn(),
  countsForSession: jest.fn(),
  listSessionPlaceIds: jest.fn(),
};
jest.unstable_mockModule('../discovery.repository.js', () => ({ default: repo }));

const mockProvider = { name: 'google_places', searchNearby: jest.fn(), searchText: jest.fn() };
jest.unstable_mockModule('../provider/providerFactory.js', () => ({
  getBusinessDiscoveryProvider: () => mockProvider,
}));

const mockPlanCoverage = jest.fn();
jest.unstable_mockModule('../engine/coveragePlanner.js', () => ({
  planCoverage: mockPlanCoverage,
  PROVIDER_PAGE_SIZE: 20,
  canSubdivideCoverageCell: () => false,
  splitCoverageCell: () => [],
}));

const mockNormalizeBusiness = jest.fn();
jest.unstable_mockModule('../engine/normalizer.js', () => ({ normalizeBusiness: mockNormalizeBusiness }));

const mockPointInArea = jest.fn();
jest.unstable_mockModule('../engine/geometry.js', () => ({
  pointInArea: mockPointInArea,
  haversineMeters: jest.fn(() => 1000),
}));

const mockClassifyBatch = jest.fn();
jest.unstable_mockModule('../engine/crmMatcher.js', () => ({ default: { classifyBatch: mockClassifyBatch } }));

const mockResolveProviderQuery = jest.fn();
jest.unstable_mockModule('../businessTypeCatalog.js', () => ({
  resolveProviderQuery: mockResolveProviderQuery,
  matchesProviderType: () => true,
}));

jest.unstable_mockModule('../discoverySession.model.js', () => ({
  DISCOVERY_SESSION_STATUS: {
    DRAFT: 'DRAFT', QUEUED: 'QUEUED', RUNNING: 'RUNNING', FETCHING: 'FETCHING',
    NORMALIZING: 'NORMALIZING', DEDUPLICATING: 'DEDUPLICATING', MATCHING: 'MATCHING',
    COMPLETED: 'COMPLETED', PARTIAL: 'PARTIAL', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
  },
}));

jest.unstable_mockModule('../discoveryResult.model.js', () => ({
  RESULT_MATCHING_STATUS: { NEW: 'NEW', EXISTING: 'EXISTING', POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE' },
  RESULT_IMPORT_STATUS: { NOT_IMPORTED: 'NOT_IMPORTED', QUEUED: 'QUEUED', IMPORTED: 'IMPORTED', SKIPPED: 'SKIPPED', FAILED: 'FAILED' },
}));

const mockEmitProgress = jest.fn();
const mockEmitResult = jest.fn();
const mockEmitCompleted = jest.fn();
jest.unstable_mockModule('../discovery.events.js', () => ({
  emitDiscoveryProgress: mockEmitProgress,
  emitDiscoveryResult: mockEmitResult,
  emitDiscoveryCompleted: mockEmitCompleted,
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));

const mockNotifCreate = jest.fn();
jest.unstable_mockModule('../../notifications/notification.service.js', () => ({ default: { create: mockNotifCreate } }));

let DiscoveryRunWorker;

beforeAll(async () => {
  DiscoveryRunWorker = (await import('../../../jobs/discoveryRun.job.js')).DiscoveryRunWorker;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults; individual tests override what they assert on.
  repo.setSessionStatus.mockResolvedValue({ status: 'RUNNING' });
  repo.updateSessionProgress.mockResolvedValue({});
  repo.bulkUpsertResults.mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 });
  repo.countsForSession.mockResolvedValue({
    discovered: 0, new: 0, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0,
  });
  repo.listSessionPlaceIds.mockResolvedValue([]);
  mockNotifCreate.mockResolvedValue({});
});

function makeSession(overrides = {}) {
  return {
    _id: 'sess-1',
    createdBy: 'user-1',
    status: 'QUEUED',
    cancelRequested: false,
    keyword: null,
    config: { maxResults: 200, initialResultLimit: 300, maxSearchRequests: 50, maxCoverageCells: 25, concurrency: 2 },
    area: { type: 'radius', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    location: {
      name: 'Paris', city: 'Paris', countryCode: 'FR', formattedAddress: 'Paris, France',
      center: { type: 'Point', coordinates: [2.3522, 48.8566] },
    },
    businessTypes: [{ id: 'restaurant' }],
    ...overrides,
  };
}

const oneCellPlan = () => ({
  strategy: 'single',
  cells: [{ center: { lat: 47.37, lng: 8.54 }, radiusMeters: 1000 }],
  polygon: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  truncated: false,
  estimatedSearches: 1,
});

describe('DiscoveryRunWorker.process', () => {
  test('uses the versioned adaptive discovery queue', () => {
    expect(new DiscoveryRunWorker().name).toBe('discovery-run-v2');
  });

  test('happy path persists results and marks COMPLETED', async () => {
    repo.getSessionById.mockResolvedValue(makeSession());
    mockPlanCoverage.mockReturnValue(oneCellPlan());
    mockResolveProviderQuery.mockReturnValue({ includedType: 'restaurant' });
    mockProvider.searchNearby.mockResolvedValue({ places: [{ id: 'place-1', displayName: { text: 'R1' } }] });
    mockNormalizeBusiness.mockReturnValue({ name: 'R1', location: { type: 'Point', coordinates: [8.54, 47.37] } });
    mockPointInArea.mockReturnValue(true);
    mockClassifyBatch.mockResolvedValue([{ status: 'NEW', matchedBy: [] }]);
    repo.bulkUpsertResults.mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
    repo.countsForSession.mockResolvedValue({
      discovered: 1, new: 1, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0,
    });

    const worker = new DiscoveryRunWorker();
    const out = await worker.process({ data: { sessionId: 'sess-1', createdBy: 'user-1' } });

    // Search responses include contact fields for accurate CRM matching.
    expect(mockProvider.searchNearby).toHaveBeenCalledWith(expect.objectContaining({
      includedTypes: ['restaurant'],
      fieldProfile: 'DETAILS_IMPORT',
    }));

    // persisted result doc shape
    expect(repo.bulkUpsertResults).toHaveBeenCalledTimes(1);
    const docs = repo.bulkUpsertResults.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      createdBy: 'user-1',
      discoverySessionId: 'sess-1',
      provider: { name: 'google_places', placeId: 'place-1' },
      matching: { status: 'NEW' },
      import: { status: 'NOT_IMPORTED' },
      discoveryContext: expect.objectContaining({
        businessTypeIds: ['restaurant'],
        matchedBusinessTypeId: 'restaurant',
        location: expect.objectContaining({ city: 'Paris', countryCode: 'FR' }),
        area: expect.objectContaining({ type: 'radius' }),
        searchCoordinates: expect.objectContaining({ radiusMeters: 1000 }),
      }),
    });

    const statuses = repo.setSessionStatus.mock.calls.map((c) => c[1]);
    expect(statuses).toContain('COMPLETED');
    expect(mockEmitCompleted).toHaveBeenCalledWith('sess-1', expect.objectContaining({ status: 'COMPLETED' }));
    expect(out).toMatchObject({ status: 'COMPLETED', discovered: 1 });
  });

  test('a failed cell yields PARTIAL (keeps going, no throw)', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({ _id: 'sess-2', config: { maxResults: 200, maxSearchRequests: 50, maxCoverageCells: 25, concurrency: 1 } }));
    mockPlanCoverage.mockReturnValue({ ...oneCellPlan(), estimatedSearches: 1 });
    mockResolveProviderQuery.mockReturnValue({ includedType: 'restaurant' });
    const providerErr = Object.assign(new Error('google unavailable'), { code: 'DISCOVERY_PROVIDER_ERROR', retryable: true });
    mockProvider.searchNearby.mockRejectedValue(providerErr);

    const worker = new DiscoveryRunWorker();
    const out = await worker.process({ data: { sessionId: 'sess-2', createdBy: 'user-1' } });

    const statuses = repo.setSessionStatus.mock.calls.map((c) => c[1]);
    expect(statuses).toContain('PARTIAL');
    expect(statuses).not.toContain('COMPLETED');
    expect(mockEmitCompleted).toHaveBeenCalledWith('sess-2', expect.objectContaining({ status: 'PARTIAL' }));
    expect(out.status).toBe('PARTIAL');
    expect(mockSearchesInc).toHaveBeenCalledWith({ status: 'error' });
  });

  test('stops the initial run after the configured result window is filled', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({
      _id: 'sess-limit',
      config: { maxResults: 200, initialResultLimit: 3, maxSearchRequests: 50, maxCoverageCells: 25, concurrency: 1 },
    }));
    mockPlanCoverage.mockReturnValue(oneCellPlan());
    mockResolveProviderQuery.mockReturnValue({ includedType: 'restaurant' });
    mockProvider.searchNearby.mockResolvedValue({
      places: Array.from({ length: 20 }, (_, index) => ({
        id: `place-${index + 1}`,
        displayName: { text: `Restaurant ${index + 1}` },
      })),
    });
    mockNormalizeBusiness.mockImplementation((raw) => ({
      name: raw.displayName.text,
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    }));
    mockPointInArea.mockReturnValue(true);
    mockClassifyBatch.mockImplementation(async (businesses) =>
      businesses.map(() => ({ status: 'NEW', matchedBy: [] })));
    repo.bulkUpsertResults.mockResolvedValue({ upsertedCount: 3, modifiedCount: 0 });
    repo.countsForSession.mockResolvedValue({
      discovered: 3, new: 3, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0,
    });

    const worker = new DiscoveryRunWorker();
    const out = await worker.process({ data: { sessionId: 'sess-limit', createdBy: 'user-1' } });

    expect(repo.bulkUpsertResults).toHaveBeenCalledTimes(1);
    expect(repo.bulkUpsertResults.mock.calls[0][0]).toHaveLength(3);
    expect(out).toMatchObject({ status: 'PARTIAL', discovered: 3 });
    expect(mockEmitCompleted).toHaveBeenCalledWith('sess-limit', expect.objectContaining({
      status: 'PARTIAL',
      coverage: expect.objectContaining({
        reasonCodes: expect.arrayContaining(['INITIAL_RESULT_LIMIT_REACHED']),
      }),
    }));
  });

  test('new sessions with no result window persist the full provider batch', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({
      _id: 'sess-unbounded',
      config: { initialResultLimit: null, maxSearchRequests: null, maxCoverageCells: 25, concurrency: 1 },
    }));
    mockPlanCoverage.mockReturnValue(oneCellPlan());
    mockResolveProviderQuery.mockReturnValue({ includedType: 'restaurant' });
    const rawPlaces = Array.from({ length: 301 }, (_, index) => ({
      id: `unbounded-${index + 1}`,
      displayName: { text: `Business ${index + 1}` },
    }));
    mockProvider.searchNearby.mockResolvedValue({ places: rawPlaces });
    mockNormalizeBusiness.mockImplementation((raw) => ({
      name: raw.displayName.text,
      normalizedName: raw.displayName.text.toLowerCase(),
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    }));
    mockPointInArea.mockReturnValue(true);
    mockClassifyBatch.mockImplementation(async (businesses) =>
      businesses.map(() => ({ status: 'NEW', matchedBy: [] })));
    repo.bulkUpsertResults.mockImplementation(async (docs) => ({ upsertedCount: docs.length, modifiedCount: 0 }));
    repo.countsForSession.mockResolvedValue({
      discovered: 301, new: 301, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0,
    });

    const out = await new DiscoveryRunWorker().process({ data: { sessionId: 'sess-unbounded', createdBy: 'user-1' } });
    const persistedDocs = repo.bulkUpsertResults.mock.calls.flatMap(([docs]) => docs);
    expect(persistedDocs).toHaveLength(301);
    expect(out.discovered).toBe(301);
  });

  test('does not collapse distinct businesses merely because they share a phone or domain', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({
      _id: 'sess-shared-contact',
      config: { initialResultLimit: null, maxSearchRequests: null, maxCoverageCells: 25, concurrency: 1 },
    }));
    mockPlanCoverage.mockReturnValue(oneCellPlan());
    mockResolveProviderQuery.mockReturnValue({ includedType: 'restaurant' });
    mockProvider.searchNearby.mockResolvedValue({
      places: [
        { id: 'branch-a', displayName: { text: 'Alpha Hotel' } },
        { id: 'branch-b', displayName: { text: 'Beta Hotel' } },
      ],
    });
    mockNormalizeBusiness.mockImplementation((raw) => ({
      name: raw.displayName.text,
      normalizedName: raw.displayName.text.toLowerCase(),
      normalizedPhone: '+33123456789',
      websiteDomain: 'hotel-group.example',
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    }));
    mockPointInArea.mockReturnValue(true);
    mockClassifyBatch.mockImplementation(async (businesses) =>
      businesses.map(() => ({ status: 'NEW', matchedBy: [] })));
    repo.bulkUpsertResults.mockResolvedValue({ upsertedCount: 2, modifiedCount: 0 });
    repo.countsForSession.mockResolvedValue({
      discovered: 2, new: 2, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0,
    });

    await new DiscoveryRunWorker().process({ data: { sessionId: 'sess-shared-contact', createdBy: 'user-1' } });
    expect(repo.bulkUpsertResults.mock.calls[0][0]).toHaveLength(2);
  });

  test('cancellation detected between cells → CANCELLED, provider not hit', async () => {
    const notCancelled = makeSession({ _id: 'sess-3', config: { maxResults: 200, maxSearchRequests: 50, maxCoverageCells: 25, concurrency: 1 } });
    const cancelled = { ...notCancelled, cancelRequested: true };
    repo.getSessionById
      .mockResolvedValueOnce(notCancelled) // process() start
      .mockResolvedValue(cancelled); // in-cell cancel check
    mockPlanCoverage.mockReturnValue(oneCellPlan());

    const worker = new DiscoveryRunWorker();
    const out = await worker.process({ data: { sessionId: 'sess-3', createdBy: 'user-1' } });

    expect(mockProvider.searchNearby).not.toHaveBeenCalled();
    const statuses = repo.setSessionStatus.mock.calls.map((c) => c[1]);
    expect(statuses).toContain('CANCELLED');
    expect(mockEmitCompleted).toHaveBeenCalledWith('sess-3', expect.objectContaining({ status: 'CANCELLED' }));
    expect(out.status).toBe('CANCELLED');
  });

  test('cancelRequested before start → immediate CANCELLED', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({ _id: 'sess-4', cancelRequested: true }));

    const worker = new DiscoveryRunWorker();
    const out = await worker.process({ data: { sessionId: 'sess-4', createdBy: 'user-1' } });

    expect(mockPlanCoverage).not.toHaveBeenCalled();
    expect(repo.setSessionStatus).toHaveBeenCalledWith('sess-4', 'CANCELLED', expect.any(Object));
    expect(out.status).toBe('CANCELLED');
  });

  test('a fatal error marks FAILED and rethrows for BullMQ retry', async () => {
    repo.getSessionById.mockResolvedValue(makeSession({ _id: 'sess-5' }));
    mockPlanCoverage.mockImplementation(() => { throw Object.assign(new Error('bad geometry'), { code: 'DISCOVERY_INVALID_GEOMETRY' }); });

    const worker = new DiscoveryRunWorker();
    await expect(worker.process({ data: { sessionId: 'sess-5', createdBy: 'user-1' } }))
      .rejects.toThrow('bad geometry');

    expect(repo.setSessionStatus).toHaveBeenCalledWith('sess-5', 'FAILED', expect.objectContaining({
      set: expect.objectContaining({ error: expect.objectContaining({ code: 'DISCOVERY_INVALID_GEOMETRY' }) }),
    }));
    expect(mockEmitCompleted).toHaveBeenCalledWith('sess-5', expect.objectContaining({ status: 'FAILED' }));
  });
});

describe('DiscoveryRunWorker.isAlreadyDone', () => {
  test('true when COMPLETED', async () => {
    repo.getSessionById.mockResolvedValue({ _id: 's', status: 'COMPLETED' });
    const worker = new DiscoveryRunWorker();
    await expect(worker.isAlreadyDone({ data: { sessionId: 's', createdBy: 'u' } })).resolves.toBe(true);
  });

  test('true when CANCELLED', async () => {
    repo.getSessionById.mockResolvedValue({ _id: 's', status: 'CANCELLED' });
    const worker = new DiscoveryRunWorker();
    await expect(worker.isAlreadyDone({ data: { sessionId: 's', createdBy: 'u' } })).resolves.toBe(true);
  });

  test('false when still RUNNING', async () => {
    repo.getSessionById.mockResolvedValue({ _id: 's', status: 'RUNNING' });
    const worker = new DiscoveryRunWorker();
    await expect(worker.isAlreadyDone({ data: { sessionId: 's', createdBy: 'u' } })).resolves.toBe(false);
  });

  test('true when the session is missing', async () => {
    repo.getSessionById.mockResolvedValue(null);
    const worker = new DiscoveryRunWorker();
    await expect(worker.isAlreadyDone({ data: { sessionId: 's', createdBy: 'u' } })).resolves.toBe(true);
  });
});
