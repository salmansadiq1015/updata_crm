import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Shared provider mock functions (reset per load).
const geocodeMock = jest.fn();
const autocompleteMock = jest.fn();
const reverseGeocodeMock = jest.fn();

/**
 * Load location.service.js with the cache and provider mocked. The cache mock is
 * a real in-memory store so cache-hit behavior (second call skips the provider)
 * can be asserted.
 */
async function loadService() {
  jest.resetModules();
  geocodeMock.mockReset();
  autocompleteMock.mockReset();
  reverseGeocodeMock.mockReset();

  const store = new Map();
  const cacheManager = {
    getOrSet: jest.fn(async (key, fetchFn) => {
      if (store.has(key)) return store.get(key);
      const value = await fetchFn();
      if (value !== null && value !== undefined) store.set(key, value);
      return value;
    }),
  };

  const provider = {
    geocode: geocodeMock,
    autocomplete: autocompleteMock,
    reverseGeocode: reverseGeocodeMock,
  };

  jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({ default: cacheManager }));
  jest.unstable_mockModule('../provider/GooglePlacesProvider.js', () => ({
    getPlacesProvider: () => provider,
    googlePlacesProvider: provider,
    default: provider,
  }));

  const mod = await import('../location.service.js');
  return { service: mod.default, cacheManager, store };
}

describe('locationService.resolveLocation', () => {
  beforeEach(() => {
    geocodeMock.mockReset();
  });

  test('geocodes and maps to a provider-agnostic location DTO', async () => {
    const { service } = await loadService();
    geocodeMock.mockResolvedValue({
      result: {
        formatted_address: 'Zürich, Switzerland',
        geometry: {
          location: { lat: 47.3769, lng: 8.5417 },
          viewport: {
            northeast: { lat: 47.43, lng: 8.63 },
            southwest: { lat: 47.32, lng: 8.45 },
          },
        },
        address_components: [
          { long_name: 'Zürich', short_name: 'Zürich', types: ['locality'] },
          { long_name: 'Canton of Zürich', short_name: 'ZH', types: ['administrative_area_level_1'] },
          { long_name: 'Switzerland', short_name: 'CH', types: ['country'] },
        ],
        place_id: 'ChIJ-zurich',
      },
      results: [],
    });

    const dto = await service.resolveLocation('Zürich');

    expect(dto).toMatchObject({
      name: 'Zürich, Switzerland',
      center: { lat: 47.3769, lng: 8.5417 },
      formattedAddress: 'Zürich, Switzerland',
      placeId: 'ChIJ-zurich',
      countryCode: 'CH',
      country: 'Switzerland',
      region: 'Canton of Zürich',
      city: 'Zürich',
    });
    expect(dto.bounds.northeast).toEqual({ lat: 47.43, lng: 8.63 });
    expect(dto.components).toHaveLength(3);
    expect(geocodeMock).toHaveBeenCalledWith('Zürich');
  });

  test('caches: a second call for the same (normalized) query does not re-hit the provider', async () => {
    const { service, cacheManager } = await loadService();
    geocodeMock.mockResolvedValue({
      result: {
        formatted_address: 'Bern, Switzerland',
        geometry: { location: { lat: 46.948, lng: 7.4474 } },
        address_components: [],
        place_id: 'ChIJ-bern',
      },
      results: [],
    });

    const first = await service.resolveLocation('Bern');
    const second = await service.resolveLocation('  bern '); // normalizes to the same key

    expect(first).toEqual(second);
    expect(geocodeMock).toHaveBeenCalledTimes(1);
    expect(cacheManager.getOrSet).toHaveBeenCalledTimes(2);
    expect(cacheManager.getOrSet.mock.calls[0][0]).toBe('discovery:geocode:bern');
  });

  test('throws a ValidationError on an empty query (no provider call)', async () => {
    const { service } = await loadService();
    await expect(service.resolveLocation('   ')).rejects.toMatchObject({ statusCode: 400 });
    expect(geocodeMock).not.toHaveBeenCalled();
  });
});

describe('locationService.autocomplete', () => {
  beforeEach(() => {
    autocompleteMock.mockReset();
  });

  test('maps Places (New) suggestions to prediction DTOs', async () => {
    const { service } = await loadService();
    autocompleteMock.mockResolvedValue({
      predictions: [
        {
          placePrediction: {
            placeId: 'p1',
            text: { text: 'Zurich HB, Zurich' },
            structuredFormat: {
              mainText: { text: 'Zurich HB' },
              secondaryText: { text: 'Zurich, Switzerland' },
            },
            types: ['train_station'],
          },
        },
      ],
    });

    const out = await service.autocomplete('Zur', { sessionToken: 'tok-1' });

    expect(out.predictions[0]).toEqual({
      placeId: 'p1',
      description: 'Zurich HB, Zurich',
      mainText: 'Zurich HB',
      secondaryText: 'Zurich, Switzerland',
      types: ['train_station'],
    });
    expect(autocompleteMock).toHaveBeenCalledWith({
      input: 'Zur',
      sessionToken: 'tok-1',
      center: undefined,
    });
  });

  test('caches by input independent of the session token', async () => {
    const { service, cacheManager } = await loadService();
    autocompleteMock.mockResolvedValue({ predictions: [] });

    await service.autocomplete('cof', { sessionToken: 'token-A' });
    await service.autocomplete('cof', { sessionToken: 'token-B' }); // same input → cache hit

    expect(autocompleteMock).toHaveBeenCalledTimes(1);
    // Cache key is session-token-independent.
    expect(cacheManager.getOrSet.mock.calls[0][0]).toBe('discovery:autocomplete:cof:nobias');
  });

  test('returns an empty prediction list for blank input without calling the provider', async () => {
    const { service } = await loadService();
    const out = await service.autocomplete('   ');
    expect(out).toEqual({ predictions: [] });
    expect(autocompleteMock).not.toHaveBeenCalled();
  });
});
