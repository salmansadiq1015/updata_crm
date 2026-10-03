// Mock DTO factories for the Leads module tests.

let leadCounter = 1;

export const ok = (data: unknown) => ({ success: true, data });

export const okPage = (
  data: unknown[],
  pagination: Partial<{ hasNext: boolean; nextCursor: string | null; limit: number }> = {},
) => ({
  success: true,
  data,
  pagination: { hasNext: false, nextCursor: null, limit: 50, ...pagination },
});

export function makeLeadDTO(overrides: Record<string, unknown> = {}) {
  const n = leadCounter++;
  const id = `lead-${n}`;
  const now = new Date().toISOString();
  return {
    id,
    leadNumber: `L-${String(n).padStart(5, '0')}`,
    name: `Lead ${n}`,
    type: 'business',
    status: 'new',
    address: {
      street: 'Bahnhofstrasse 1',
      postalCode: '8001',
      city: 'Zürich',
      canton: 'ZH',
      country: 'CH',
    },
    phone: '+41 44 123 45 67',
    mobile: null,
    email: 'info@example.ch',
    website: 'https://example.ch',
    websiteDomain: 'example.ch',
    location: { lat: 47.3769, lng: 8.5417 },
    providerMeta: { rating: 4.5, reviewCount: 120, priceLevel: 2 },
    source: 'google_places',
    sourceMetadata: {
      googlePlaceId: `place-${id}`,
      discoverySessionId: 'sess-1',
      discoveryResultId: 'res-1',
      businessType: 'restaurant',
      keyword: 'pizza',
      discoveredAt: now,
    },
    assignedTo: null,
    notes: null,
    tags: [],
    convertedCustomerId: null,
    convertedAt: null,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeDuplicateDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    entityType: 'customer',
    name: 'Existing AG',
    phone: '+41 44 123 45 67',
    website: 'https://example.ch',
    placeId: 'place-abc',
    matchedBy: ['PHONE'],
    confidence: 0.95,
    ...overrides,
  };
}
