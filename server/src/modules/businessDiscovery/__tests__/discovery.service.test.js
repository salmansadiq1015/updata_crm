import {
  jest,
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
} from '@jest/globals';

// ── Mock registrations MUST precede importing the service under test ──

const mockCreateSession = jest.fn();
const mockGetSessionById = jest.fn();
const mockSetSessionStatus = jest.fn();
const mockListSessions = jest.fn();
const mockListResults = jest.fn();
const mockGetResultById = jest.fn();
const mockAddJob = jest.fn();
const mockLogEvent = jest.fn();
const mockPublish = jest.fn();
const mockUpdateSessionProgress = jest.fn();
const mockCountsForSession = jest.fn();
// Deferred Place-details enrichment (its own suite: detailsEnricher.test.js). Here
// it returns the result unchanged so getResult DTO behaviour is tested in isolation.
const mockEnrich = jest.fn(async (result) => ({ result, fetched: false }));

jest.unstable_mockModule('../discovery.repository.js', () => ({
  default: {
    createSession: mockCreateSession,
    getSessionById: mockGetSessionById,
    setSessionStatus: mockSetSessionStatus,
    listSessions: mockListSessions,
    listResults: mockListResults,
    getResultById: mockGetResultById,
    updateSessionProgress: mockUpdateSessionProgress,
    countsForSession: mockCountsForSession,
  },
}));

jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockAddJob },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: mockPublish },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../../config/index.js', () => ({
  default: {
    discovery: {
      maxResults: 200,
      maxSearchRequests: 50,
      maxCoverageCells: 25,
      concurrency: 3,
      initialResultLimit: 300,
      staleTimeoutMs: 600000,
      resultTtlDays: 30,
    },
  },
}));

jest.unstable_mockModule('../provider/providerFactory.js', () => ({
  getBusinessDiscoveryProvider: () => ({ name: 'openstreetmap' }),
}));

jest.unstable_mockModule('../engine/detailsEnricher.js', () => ({
  enrichResultWithDetails: mockEnrich,
  default: { enrichResultWithDetails: mockEnrich },
}));

let discoveryService;
let DISCOVERY_SESSION_STATUS;
let RESULT_MATCHING_STATUS;
let RESULT_IMPORT_STATUS;

beforeAll(async () => {
  discoveryService = (await import('../discovery.service.js')).default;
  ({ DISCOVERY_SESSION_STATUS } = await import('../discoverySession.model.js'));
  ({ RESULT_MATCHING_STATUS, RESULT_IMPORT_STATUS } = await import('../discoveryResult.model.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

const USER = 'user-1';

describe('discoveryService.createDiscovery', () => {
  test('builds a QUEUED session and enqueues the discovery-run job', async () => {
    mockCreateSession.mockResolvedValue({ _id: 'sess-1' });

    const input = {
      location: {
        name: 'Zurich',
        mode: 'search',
        center: { lat: 47.3769, lng: 8.5417 },
        placeId: 'zurich-place',
        countryCode: 'CH',
        country: 'Switzerland',
        region: 'Zurich',
        city: 'Zurich',
        formattedAddress: 'Zurich, Switzerland',
      },
      area: { type: 'radius', radiusMeters: 1000 },
      businessTypes: [{ id: 'restaurant', name: 'Restaurant' }],
      keyword: null,
    };

    const result = await discoveryService.createDiscovery(input, USER, { ipAddress: '127.0.0.1' });

    expect(result).toEqual({ sessionId: 'sess-1' });

    // Session document shape
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const doc = mockCreateSession.mock.calls[0][0];
    expect(doc.status).toBe(DISCOVERY_SESSION_STATUS.QUEUED);
    expect(doc.createdBy).toBe(USER);
    expect(doc.provider).toEqual({ name: 'openstreetmap', version: 'adaptive-v2' });
    // Center stored as GeoJSON [lng, lat]
    expect(doc.location.center).toEqual({ type: 'Point', coordinates: [8.5417, 47.3769] });
    expect(doc.location).toMatchObject({
      placeId: 'zurich-place',
      countryCode: 'CH',
      country: 'Switzerland',
      region: 'Zurich',
      city: 'Zurich',
      formattedAddress: 'Zurich, Switzerland',
    });
    expect(doc.config.maxSearchRequests).toBeNull();
    expect(doc.config.initialResultLimit).toBe(300);
    // Area normalized to a polygon for coverage / filtering
    expect(doc.area.type).toBe('radius');
    expect(doc.area.radiusMeters).toBe(1000);
    expect(doc.area.geometry.type).toBe('Polygon');
    expect(Array.isArray(doc.area.geometry.coordinates[0])).toBe(true);
    expect(typeof doc.area.areaSqKm).toBe('number');
    // Business type resolved to the provider query hints
    expect(doc.businessTypes[0]).toMatchObject({
      id: 'restaurant',
      name: 'Restaurant',
      providerIncludedType: 'restaurant',
      providerTextQuery: null,
    });
    expect(doc.expiresAt instanceof Date).toBe(true);

    // Enqueue
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    const [queueName, jobName, payload] = mockAddJob.mock.calls[0];
    expect(queueName).toBe('discovery-run-v2');
    expect(jobName).toContain('discovery-run-v2-sess-1');
    expect(payload).toEqual({ sessionId: 'sess-1', createdBy: 'user-1' });

    // Audit + event
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'discovery.session.created',
      module: 'discovery',
    }));
    expect(mockPublish).toHaveBeenCalledWith('discovery.session.created', expect.any(Object), expect.any(Object));
  });

  test('resolves a custom (free-text) business type to a text query', async () => {
    mockCreateSession.mockResolvedValue({ _id: 'sess-2' });

    const input = {
      location: { name: 'Zurich', mode: 'search', center: { lat: 47.3769, lng: 8.5417 } },
      area: { type: 'radius', radiusMeters: 500 },
      businessTypes: ['solar installer'],
      keyword: 'commercial',
    };

    await discoveryService.createDiscovery(input, USER, {});

    const doc = mockCreateSession.mock.calls[0][0];
    expect(doc.businessTypes[0].providerIncludedType).toBeNull();
    expect(doc.businessTypes[0].providerTextQuery).toContain('solar installer');
    expect(doc.businessTypes[0].providerTextQuery).toContain('commercial');
  });

  test('rejects an invalid geometry with DISCOVERY_INVALID_GEOMETRY', async () => {
    const input = {
      location: { name: 'Bad', mode: 'search', center: { lat: 999, lng: 0 } },
      area: { type: 'radius', radiusMeters: 1000 },
      businessTypes: [{ id: 'restaurant' }],
    };

    await expect(discoveryService.createDiscovery(input, USER, {}))
      .rejects.toMatchObject({ code: 'DISCOVERY_INVALID_GEOMETRY', statusCode: 400 });
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  test('rejects an oversized area with DISCOVERY_AREA_TOO_LARGE', async () => {
    const input = {
      location: { name: 'Huge', mode: 'draw', center: { lat: 45, lng: 0 } },
      area: { type: 'rectangle', bounds: { north: 50, south: 40, east: 10, west: -10 } },
      businessTypes: [{ id: 'restaurant' }],
    };

    await expect(discoveryService.createDiscovery(input, USER, {}))
      .rejects.toMatchObject({ code: 'DISCOVERY_AREA_TOO_LARGE', statusCode: 400 });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe('discoveryService DTOs', () => {
  test('toResultDTO flattens the business and converts [lng,lat] → {lat,lng}', () => {
    const stored = {
      _id: 'res-1',
      business: {
        name: 'Cafe Central',
        primaryType: 'cafe',
        rating: 4.5,
        reviewCount: 120,
        phone: '+41 44 123 45 67',
        internationalPhone: '+41 44 123 45 67',
        website: 'https://example.ch',
        email: null,
        address: { formatted: 'Bahnhofstrasse 1, Zurich' },
        location: { type: 'Point', coordinates: [8.5417, 47.3769] },
        mapsUrl: 'https://maps.google.com/?q=...',
        openingHours: { weekdayDescriptions: [] },
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
      },
      matching: { status: RESULT_MATCHING_STATUS.NEW, matchedLeadId: null },
      import: { status: RESULT_IMPORT_STATUS.NOT_IMPORTED },
      discoveredAt: new Date('2026-01-01T00:00:00Z'),
    };

    const dto = discoveryService.toResultDTO(stored);

    expect(dto).toMatchObject({
      id: 'res-1',
      crmStatus: 'NEW',
      importStatus: 'NOT_IMPORTED',
      matchedLeadId: null,
    });
    expect(dto.business.type).toBe('cafe');
    expect(dto.business.address).toBe('Bahnhofstrasse 1, Zurich');
    expect(dto.business.location).toEqual({ lat: 47.3769, lng: 8.5417 });
    // No raw GeoJSON leaks into the DTO
    expect(dto.business.location.coordinates).toBeUndefined();
  });

  test('toSessionDTO exposes coverage + converts the centre point', () => {
    const stored = {
      _id: 'sess-9',
      status: DISCOVERY_SESSION_STATUS.PARTIAL,
      location: { name: 'Zurich', mode: 'search', center: { type: 'Point', coordinates: [8.5417, 47.3769] } },
      area: { type: 'radius', radiusMeters: 1000, geometry: { type: 'Polygon', coordinates: [[]] }, bounds: {}, areaSqKm: 3.1 },
      businessTypes: [{ id: 'restaurant' }],
      keyword: 'vegan',
      progress: { searchesCompleted: 3, searchesTotal: 5, percent: 100 },
      counts: { discovered: 10, new: 7 },
      usage: { searchRequests: 6 },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      completedAt: new Date('2026-01-01T00:05:00Z'),
    };

    const dto = discoveryService.toSessionDTO(stored);

    expect(dto.id).toBe('sess-9');
    expect(dto.status).toBe('PARTIAL');
    expect(dto.location.center).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(dto.coverage).toEqual(expect.objectContaining({
      state: 'PARTIAL',
      providerGuaranteesCompleteness: false,
      searchesCompleted: 3,
      searchesTotal: 5,
    }));
  });

  test('never presents a completed legacy single-query session as exhausted coverage', () => {
    const dto = discoveryService.toSessionDTO({
      _id: 'legacy-session',
      status: DISCOVERY_SESSION_STATUS.COMPLETED,
      provider: { name: 'google_places', version: null },
      progress: { searchesCompleted: 1, searchesTotal: 1 },
      counts: { discovered: 20 },
      usage: { searchRequests: 1 },
      coverage: { state: 'EXHAUSTED', reasonCodes: [] },
    });

    expect(dto.coverage.state).toBe('PARTIAL');
    expect(dto.coverage.reasonCodes).toContain('LEGACY_SINGLE_QUERY_NOT_EXHAUSTIVE');
  });

  test('preserves explicit exhausted coverage from the adaptive provider strategy', () => {
    const dto = discoveryService.toSessionDTO({
      _id: 'adaptive-session',
      status: DISCOVERY_SESSION_STATUS.COMPLETED,
      provider: { name: 'google_places', version: 'adaptive-v2' },
      coverage: { state: 'EXHAUSTED', reasonCodes: ['PROVIDER_CATALOG_NOT_GUARANTEED'] },
    });

    expect(dto.coverage.state).toBe('EXHAUSTED');
    expect(dto.coverage.reasonCodes).not.toContain('LEGACY_SINGLE_QUERY_NOT_EXHAUSTIVE');
  });
});

describe('discoveryService.getSession', () => {
  test('marks a stale active session failed so analysis cannot spin forever', async () => {
    const staleSession = {
      _id: 'stale-session',
      status: DISCOVERY_SESSION_STATUS.FETCHING,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      progress: { stage: 'fetching', percent: 2, searchesCompleted: 0, searchesTotal: 16 },
      counts: { discovered: 0, new: 0, existing: 0, possibleDuplicates: 0, imported: 0, skipped: 0, failed: 0 },
    };
    const failedSession = {
      ...staleSession,
      status: DISCOVERY_SESSION_STATUS.FAILED,
      completedAt: new Date('2026-01-01T00:20:00Z'),
      error: {
        code: 'DISCOVERY_PROVIDER_ERROR',
        message: 'Discovery analysis timed out after no progress from the worker.',
        retryable: true,
      },
    };
    mockGetSessionById.mockResolvedValue(staleSession);
    mockSetSessionStatus.mockResolvedValue(failedSession);

    const dto = await discoveryService.getSession('stale-session', USER);

    expect(mockSetSessionStatus).toHaveBeenCalledWith('stale-session', DISCOVERY_SESSION_STATUS.FAILED, expect.objectContaining({
      expectedStatus: expect.arrayContaining([DISCOVERY_SESSION_STATUS.FETCHING]),
      set: expect.objectContaining({
        error: expect.objectContaining({ retryable: true }),
      }),
      createdBy: USER,
    }));
    expect(dto.status).toBe(DISCOVERY_SESSION_STATUS.FAILED);
    expect(dto.error?.message).toMatch(/timed out/i);
  });

  test('leaves recently updated active sessions running', async () => {
    const freshSession = {
      _id: 'fresh-session',
      status: DISCOVERY_SESSION_STATUS.FETCHING,
      updatedAt: new Date(),
      progress: { stage: 'fetching', percent: 2 },
      counts: { discovered: 0 },
    };
    mockGetSessionById.mockResolvedValue(freshSession);

    const dto = await discoveryService.getSession('fresh-session', USER);

    expect(mockSetSessionStatus).not.toHaveBeenCalled();
    expect(dto.status).toBe(DISCOVERY_SESSION_STATUS.FETCHING);
  });

  test('reconciles deflated counts for a terminal session from the stored results', async () => {
    // Stored counts were left deflated (live per-run deltas / a stalled run):
    // "0 new" even though 248 results are actually NEW.
    const terminalSession = {
      _id: 'sess-partial',
      status: DISCOVERY_SESSION_STATUS.PARTIAL,
      updatedAt: new Date(),
      counts: { discovered: 300, new: 0, existing: 0, possibleDuplicates: 52, imported: 0, skipped: 0, failed: 0 },
    };
    mockGetSessionById.mockResolvedValue(terminalSession);
    mockCountsForSession.mockResolvedValue({
      discovered: 300, new: 248, existing: 0, possibleDuplicates: 52,
      imported: 0, skipped: 0, failed: 0, queued: 0, notImported: 300,
    });
    mockUpdateSessionProgress.mockImplementation(async (_id, { counts }) => ({
      ...terminalSession, counts: { ...terminalSession.counts, ...counts },
    }));

    const dto = await discoveryService.getSession('sess-partial', USER);

    expect(mockCountsForSession).toHaveBeenCalledWith('sess-partial', { createdBy: USER });
    expect(mockUpdateSessionProgress).toHaveBeenCalledWith(
      'sess-partial',
      { counts: expect.objectContaining({ new: 248, discovered: 300 }) },
      { createdBy: USER },
    );
    expect(dto.counts.new).toBe(248);
    expect(dto.counts.possibleDuplicates).toBe(52);
  });

  test('does not reconcile counts while a session is still active', async () => {
    mockGetSessionById.mockResolvedValue({
      _id: 'sess-running',
      status: DISCOVERY_SESSION_STATUS.FETCHING,
      updatedAt: new Date(),
      counts: { discovered: 120, new: 100, existing: 0, possibleDuplicates: 20, imported: 0, skipped: 0, failed: 0 },
    });

    await discoveryService.getSession('sess-running', USER);

    expect(mockCountsForSession).not.toHaveBeenCalled();
    expect(mockUpdateSessionProgress).not.toHaveBeenCalled();
  });
});

describe('discoveryService.getResult', () => {
  test('lazily enriches with Place Details on open, then returns the flattened DTO', async () => {
    const stored = {
      _id: 'res-7',
      provider: { placeId: 'place-7' },
      business: {
        name: 'Eggspectation', primaryType: 'breakfast_restaurant', phone: null, website: null,
        location: { type: 'Point', coordinates: [74.35067, 31.53054] },
      },
      matching: { status: RESULT_MATCHING_STATUS.NEW, matchedLeadId: null },
      import: { status: RESULT_IMPORT_STATUS.NOT_IMPORTED },
    };
    mockGetResultById.mockResolvedValue(stored);
    // Simulate a Place Details fetch that fills the missing contact fields.
    mockEnrich.mockResolvedValueOnce({
      result: {
        ...stored,
        business: { ...stored.business, phone: '+92 42 111 222333', website: 'https://eggspectation.pk' },
        details: { fetchedAt: new Date(), source: 'google_places' },
      },
      fetched: true,
    });

    const dto = await discoveryService.getResult('res-7', USER);

    expect(mockGetResultById).toHaveBeenCalledWith('res-7', { createdBy: USER });
    // Opening a result triggers the deferred details fetch (DETAILS_STANDARD profile).
    expect(mockEnrich).toHaveBeenCalledWith(stored, { fieldProfile: 'DETAILS_STANDARD', createdBy: USER });
    expect(dto.business.phone).toBe('+92 42 111 222333');
    expect(dto.business.website).toBe('https://eggspectation.pk');
  });

  test('throws when the scoped result does not exist', async () => {
    mockGetResultById.mockResolvedValue(null);
    await expect(discoveryService.getResult('missing', USER)).rejects.toThrow('Discovery result not found');
  });
});

describe('discoveryService.getBusinessTypes', () => {
  test('returns grouped catalog entries with per-type i18n keys', () => {
    const groups = discoveryService.getBusinessTypes();
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
    const firstType = groups[0].types[0];
    expect(firstType).toHaveProperty('id');
    expect(firstType).toHaveProperty('i18nKey');
    expect(firstType.i18nKey).toMatch(/^leadgen\.type\./);
  });
});
