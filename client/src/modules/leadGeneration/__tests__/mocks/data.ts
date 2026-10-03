// Mock DTO factories for the Business Discovery module tests.
// Shapes mirror the API DTO contract (LEAD_GENERATION_DESIGN.md §11/§72).

let sessionCounter = 1;
let resultCounter = 1;

export const ok = (data: unknown) => ({ success: true, data });

export const okPage = (
  data: unknown[],
  pagination: Partial<{ hasNext: boolean; nextCursor: string | null; limit: number }> = {},
) => ({
  success: true,
  data,
  pagination: {
    hasNext: false,
    nextCursor: null,
    limit: 50,
    ...pagination,
  },
});

export function makeBusinessType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'restaurant',
    name: 'Restaurant',
    providerIncludedType: 'restaurant',
    providerTextQuery: null,
    icon: 'utensils',
    category: 'food',
    i18nKey: 'leadgen.businessType.restaurant',
    ...overrides,
  };
}

export function makeSessionDTO(overrides: Record<string, unknown> = {}) {
  const id = `sess-${sessionCounter++}`;
  const now = new Date().toISOString();
  return {
    id,
    status: 'RUNNING',
    location: {
      name: 'Zürich',
      mode: 'search',
      center: { lat: 47.3769, lng: 8.5417 },
      countryCode: 'CH',
      country: 'Switzerland',
      region: 'Zürich',
      city: 'Zürich',
      formattedAddress: 'Zürich, Switzerland',
    },
    area: {
      type: 'radius',
      radiusMeters: 2000,
      geometry: { type: 'Polygon', coordinates: [[[8.5, 47.3], [8.6, 47.3], [8.6, 47.4], [8.5, 47.3]]] },
      bounds: { north: 47.4, south: 47.3, east: 8.6, west: 8.5 },
      areaSqKm: 12.5,
    },
    businessTypes: [
      { id: 'restaurant', name: 'Restaurant', providerIncludedType: 'restaurant', providerTextQuery: null },
    ],
    keyword: 'pizza',
    provider: { name: 'google_places', version: 'v1' },
    config: {
      maxResults: 200,
      maxSearchRequests: 50,
      maxCoverageCells: 25,
      concurrency: 2,
      detailsOnImport: true,
    },
    progress: {
      stage: 'FETCHING',
      percent: 40,
      searchesCompleted: 4,
      searchesTotal: 10,
      resultsDiscovered: 18,
      resultsPersisted: 18,
      errors: 0,
    },
    counts: {
      discovered: 18,
      new: 12,
      existing: 4,
      possibleDuplicates: 2,
      imported: 0,
      skipped: 0,
      failed: 0,
    },
    usage: { searchRequests: 4, detailsRequests: 0, geocodeRequests: 1 },
    cancelRequested: false,
    error: null,
    createdBy: 'user-1',
    startedAt: now,
    completedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeResultDTO(overrides: Record<string, unknown> = {}) {
  const id = `res-${resultCounter++}`;
  const now = new Date().toISOString();
  return {
    id,
    discoverySessionId: 'sess-1',
    placeId: `place-${id}`,
    business: {
      name: 'ABC Restaurant',
      primaryType: 'restaurant',
      type: 'Restaurant',
      types: ['restaurant', 'food'],
      phone: '+41 44 123 45 67',
      website: 'https://abc-restaurant.ch',
      websiteDomain: 'abc-restaurant.ch',
      email: null,
      address: {
        formatted: 'Bahnhofstrasse 1, 8001 Zürich',
        street: 'Bahnhofstrasse 1',
        city: 'Zürich',
        postalCode: '8001',
        country: 'CH',
        canton: 'ZH',
      },
      location: { lat: 47.3769, lng: 8.5417 },
      rating: 4.6,
      reviewCount: 324,
      priceLevel: 2,
      businessStatus: 'OPERATIONAL',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=47.3769,8.5417',
    },
    crmStatus: 'NEW',
    matchedLeadId: null,
    matchedCustomerId: null,
    matchedBy: [],
    importStatus: 'NOT_IMPORTED',
    importedLeadId: null,
    importedAt: null,
    importError: null,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Raw Mongo-shaped result (nested matching/import, GeoJSON) to test normalization. */
export function makeRawResultDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    _id: 'raw-res-1',
    discoverySessionId: 'sess-1',
    provider: { name: 'google_places', placeId: 'place-raw-1' },
    business: {
      name: 'Raw Pizzeria',
      primaryType: 'restaurant',
      types: ['restaurant'],
      phone: '+41 44 000 00 00',
      website: 'https://raw-pizzeria.ch',
      address: { formatted: 'Raw Str. 2, 8004 Zürich', city: 'Zürich', postalCode: '8004' },
      location: { type: 'Point', coordinates: [8.52, 47.37] }, // [lng, lat]
      rating: 4.1,
      userRatingCount: 55,
    },
    matching: { status: 'POSSIBLE_DUPLICATE', matchedLeadId: 'lead-9', matchedBy: [{ method: 'PHONE', confidence: 0.95 }] },
    import: { status: 'NOT_IMPORTED', leadId: null },
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeImportJobDTO(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: 'job-1',
    discoverySessionId: 'sess-1',
    mode: 'new',
    selection: { kind: 'ALL_NEW', resultIds: [] },
    status: 'RUNNING',
    counts: { total: 12, processed: 6, created: 5, existing: 1, duplicates: 0, skipped: 0, failed: 0 },
    error: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
