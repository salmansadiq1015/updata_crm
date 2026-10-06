import {
  jest, describe, test, expect, beforeAll, beforeEach,
} from '@jest/globals';

// ── Mocks MUST precede importing the module under test ──
const mockIsConfigured = jest.fn();
const mockPlaceDetails = jest.fn();
jest.unstable_mockModule('../provider/providerFactory.js', () => ({
  getDetailsProvider: () => ({ name: 'google_places', isConfigured: mockIsConfigured, placeDetails: mockPlaceDetails }),
}));

const mockUpdateResultDetails = jest.fn();
const mockIncrementSessionUsage = jest.fn();
jest.unstable_mockModule('../discovery.repository.js', () => ({
  default: {
    updateResultDetails: mockUpdateResultDetails,
    incrementSessionUsage: mockIncrementSessionUsage,
  },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let enrichResultWithDetails;

beforeAll(async () => {
  ({ enrichResultWithDetails } = await import('../engine/detailsEnricher.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  // The repository echoes back the merged doc (findOneAndUpdate returnDocument:after).
  mockUpdateResultDetails.mockImplementation(async (_id, { set }) => ({
    _id,
    provider: { placeId: 'place-1' },
    discoverySessionId: 'sess-1',
    business: {
      name: 'Eggspectation',
      phone: set['business.phone'] ?? null,
      website: set['business.website'] ?? null,
    },
    details: { fetchedAt: set['details.fetchedAt'], source: set['details.source'] },
  }));
  mockIncrementSessionUsage.mockResolvedValue({});
});

const baseResult = () => ({
  _id: 'res-1',
  createdBy: 'user-1',
  discoverySessionId: 'sess-1',
  provider: { placeId: 'place-1' },
  business: { name: 'Eggspectation', phone: null, website: null },
  details: { fetchedAt: null, source: null },
});

describe('enrichResultWithDetails', () => {
  test('fetches Place Details, persists the contact fields, counts usage, returns enriched', async () => {
    mockPlaceDetails.mockResolvedValue({
      place: {
        id: 'place-1',
        displayName: { text: 'Eggspectation' },
        nationalPhoneNumber: '042 111 222333',
        internationalPhoneNumber: '+92 42 111 222333',
        websiteUri: 'https://eggspectation.pk',
      },
    });

    const { result, fetched } = await enrichResultWithDetails(baseResult(), { createdBy: 'user-1' });

    expect(fetched).toBe(true);
    // Default profile is DETAILS_STANDARD.
    expect(mockPlaceDetails).toHaveBeenCalledWith('place-1', { fieldProfile: 'DETAILS_STANDARD' });
    // Persisted via dot-path $set including the website + a fetchedAt stamp.
    const [, { set, createdBy }] = mockUpdateResultDetails.mock.calls[0];
    expect(set['business.website']).toBe('https://eggspectation.pk');
    expect(set['business.phone']).toBe('042 111 222333');
    expect(set['details.fetchedAt']).toBeInstanceOf(Date);
    expect(createdBy).toBe('user-1');
    // Cost accounting bumped by one details request.
    expect(mockIncrementSessionUsage).toHaveBeenCalledWith('sess-1', { detailsRequests: 1 }, { createdBy: 'user-1' });
    expect(result.business.website).toBe('https://eggspectation.pk');
  });

  test('passes the DETAILS_IMPORT profile through when requested', async () => {
    mockPlaceDetails.mockResolvedValue({ place: { id: 'place-1', websiteUri: 'https://x.pk' } });
    await enrichResultWithDetails(baseResult(), { fieldProfile: 'DETAILS_IMPORT', createdBy: 'user-1' });
    expect(mockPlaceDetails).toHaveBeenCalledWith('place-1', { fieldProfile: 'DETAILS_IMPORT' });
  });

  test('is idempotent — skips the provider when details were already fetched', async () => {
    const already = { ...baseResult(), details: { fetchedAt: new Date(), source: 'google_places' } };
    const { result, fetched } = await enrichResultWithDetails(already);
    expect(fetched).toBe(false);
    expect(mockPlaceDetails).not.toHaveBeenCalled();
    expect(mockUpdateResultDetails).not.toHaveBeenCalled();
    expect(result).toBe(already);
  });

  test('skips when discovery is not configured (no key)', async () => {
    mockIsConfigured.mockReturnValue(false);
    const { fetched } = await enrichResultWithDetails(baseResult());
    expect(fetched).toBe(false);
    expect(mockPlaceDetails).not.toHaveBeenCalled();
  });

  test('skips when the result has no provider place id', async () => {
    const noPlace = { ...baseResult(), provider: {} };
    const { fetched } = await enrichResultWithDetails(noPlace);
    expect(fetched).toBe(false);
    expect(mockPlaceDetails).not.toHaveBeenCalled();
  });

  test('best-effort: a provider error returns the original result without throwing', async () => {
    mockPlaceDetails.mockRejectedValue(new Error('places 500'));
    const input = baseResult();
    const { result, fetched } = await enrichResultWithDetails(input);
    expect(fetched).toBe(false);
    expect(result).toBe(input);
    expect(mockUpdateResultDetails).not.toHaveBeenCalled();
  });
});
