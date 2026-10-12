import { describe, test, expect, jest, afterEach } from '@jest/globals';
import {
  GooglePlacesProvider,
  googlePlacesProvider,
  getPlacesProvider,
} from '../provider/GooglePlacesProvider.js';
import { OverpassProvider } from '../provider/OverpassProvider.js';
import { NominatimProvider } from '../provider/NominatimProvider.js';
import { PlacesProvider } from '../provider/PlacesProvider.js';
import { FIELD_PROFILES } from '../provider/fieldProfiles.js';
import { discoveryPlacesApiCallsTotal } from '../../../metrics/index.js';
import logger from '../../../shared/logger/index.js';
import ERROR_CODES from '../../../shared/errors/errorCodes.js';

const API_KEY = 'TEST-SECRET-PLACES-KEY-abc123';

function okHttp(data) {
  return { request: jest.fn().mockResolvedValue({ data }) };
}

function makeProvider(httpClient, overrides = {}) {
  return new GooglePlacesProvider({
    apiKey: API_KEY,
    geocodingApiKey: API_KEY,
    httpClient,
    ...overrides,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PlacesProvider (base contract)', () => {
  test('base methods are unimplemented and isConfigured() is false', async () => {
    const base = new PlacesProvider();
    expect(base.isConfigured()).toBe(false);
    await expect(base.searchNearby({})).rejects.toThrow(/not implemented/i);
    await expect(base.searchText({})).rejects.toThrow(/not implemented/i);
    await expect(base.placeDetails('x', {})).rejects.toThrow(/not implemented/i);
    await expect(base.autocomplete({})).rejects.toThrow(/not implemented/i);
    await expect(base.geocode('x')).rejects.toThrow(/not implemented/i);
    await expect(base.reverseGeocode({})).rejects.toThrow(/not implemented/i);
  });
});

describe('GooglePlacesProvider — singleton & accessor', () => {
  test('exports a configured singleton and a getPlacesProvider() accessor', () => {
    expect(getPlacesProvider()).toBe(googlePlacesProvider);
    expect(googlePlacesProvider).toBeInstanceOf(GooglePlacesProvider);
    expect(googlePlacesProvider).toBeInstanceOf(PlacesProvider);
  });
});

describe('GooglePlacesProvider — searchNearby', () => {
  test('POSTs the right URL/body and sends the key in a header (never in the URL)', async () => {
    const http = okHttp({ places: [{ id: 'p1' }] });
    const provider = makeProvider(http);

    const res = await provider.searchNearby({
      center: { lat: 47.3769, lng: 8.5417 },
      radiusMeters: 1500,
      includedTypes: ['restaurant'],
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      fieldProfile: 'DISCOVERY_MINIMAL',
    });

    expect(http.request).toHaveBeenCalledTimes(1);
    const cfg = http.request.mock.calls[0][0];
    expect(cfg.method).toBe('POST');
    expect(cfg.url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(cfg.headers['X-Goog-Api-Key']).toBe(API_KEY);
    expect(cfg.headers['X-Goog-FieldMask']).toBe(FIELD_PROFILES.DISCOVERY_MINIMAL.join(','));
    expect(cfg.data.locationRestriction.circle).toEqual({
      center: { latitude: 47.3769, longitude: 8.5417 },
      radius: 1500,
    });
    expect(cfg.data.includedTypes).toEqual(['restaurant']);
    expect(cfg.data.maxResultCount).toBe(20);
    expect(cfg.data.rankPreference).toBe('POPULARITY');

    // Key secrecy: never in the URL or body.
    expect(cfg.url).not.toContain(API_KEY);
    expect(JSON.stringify(cfg.data)).not.toContain(API_KEY);
    expect(cfg.params).toBeUndefined();

    expect(res.places).toEqual([{ id: 'p1' }]);
    expect(res.raw).toEqual({ places: [{ id: 'p1' }] });
  });

  test('clamps maxResultCount to the Places (New) hard cap of 20', async () => {
    const http = okHttp({ places: [] });
    const provider = makeProvider(http);
    await provider.searchNearby({
      center: { lat: 1, lng: 2 },
      radiusMeters: 100,
      includedTypes: ['cafe'],
      maxResultCount: 100,
    });
    expect(http.request.mock.calls[0][0].data.maxResultCount).toBe(20);
  });
});

describe('GooglePlacesProvider — searchText (pagination)', () => {
  test('returns nextPageToken when present and forwards the inbound pageToken', async () => {
    const http = okHttp({ places: [{ id: 'a' }], nextPageToken: 'TOKEN-123' });
    const provider = makeProvider(http);

    const res = await provider.searchText({
      textQuery: 'coffee',
      includedType: 'cafe',
      center: { lat: 1, lng: 2 },
      radiusMeters: 1000,
      maxResultCount: 20,
      pageToken: 'PREV-TOKEN',
      fieldProfile: 'DISCOVERY_MINIMAL',
    });

    const cfg = http.request.mock.calls[0][0];
    expect(cfg.url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(cfg.data.textQuery).toBe('coffee');
    expect(cfg.data.includedType).toBe('cafe');
    expect(cfg.data.pageToken).toBe('PREV-TOKEN');
    expect(cfg.data.locationBias.circle.center).toEqual({ latitude: 1, longitude: 2 });
    // nextPageToken must be requested in the field mask to come back.
    expect(cfg.headers['X-Goog-FieldMask']).toContain('nextPageToken');
    expect(cfg.headers['X-Goog-FieldMask']).toContain('places.id');

    expect(res.nextPageToken).toBe('TOKEN-123');
    expect(res.places).toEqual([{ id: 'a' }]);
  });

  test('omits nextPageToken from the result when the provider returns none', async () => {
    const http = okHttp({ places: [] });
    const provider = makeProvider(http);
    const res = await provider.searchText({ textQuery: 'x' });
    expect(res.nextPageToken).toBeUndefined();
  });

  test('uses a hard rectangle restriction, strict type filtering and pageSize', async () => {
    const http = okHttp({ places: [] });
    const provider = makeProvider(http);
    await provider.searchText({
      textQuery: 'medical clinic',
      includedType: 'doctor',
      center: { lat: 1, lng: 2 },
      radiusMeters: 5000,
      bounds: { north: 2, south: 1, east: 3, west: 2 },
      maxResultCount: 50,
    });
    const body = http.request.mock.calls[0][0].data;
    expect(body.pageSize).toBe(20);
    expect(body.strictTypeFiltering).toBe(true);
    expect(body.locationBias).toBeUndefined();
    expect(body.locationRestriction.rectangle).toEqual({
      low: { latitude: 1, longitude: 2 },
      high: { latitude: 2, longitude: 3 },
    });
  });
});

describe('GooglePlacesProvider — placeDetails', () => {
  test('GETs places/{id} and strips the "places." prefix from the field mask', async () => {
    const http = okHttp({ id: 'p1', displayName: { text: 'Shop' } });
    const provider = makeProvider(http);

    const res = await provider.placeDetails('ChIJabc', { fieldProfile: 'DETAILS_STANDARD' });

    const cfg = http.request.mock.calls[0][0];
    expect(cfg.method).toBe('GET');
    expect(cfg.url).toBe('https://places.googleapis.com/v1/places/ChIJabc');
    const mask = cfg.headers['X-Goog-FieldMask'];
    expect(mask).not.toContain('places.');
    const paths = mask.split(',');
    expect(paths).toContain('id');
    expect(paths).toContain('displayName');
    expect(paths).toContain('nationalPhoneNumber');

    expect(res.place).toEqual({ id: 'p1', displayName: { text: 'Shop' } });
  });
});

describe('GooglePlacesProvider — error taxonomy', () => {
  test('timeout → retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const timeout = Object.assign(new Error('timeout of 10000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(timeout) });
    await expect(
      provider.searchNearby({ center: { lat: 1, lng: 2 }, radiusMeters: 100, includedTypes: ['cafe'] }),
    ).rejects.toMatchObject({ code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR, retryable: true });
  });

  test('ECONNRESET (network) → retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(reset) });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      retryable: true,
    });
  });

  test('HTTP 500 → retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const serverErr = Object.assign(new Error('Internal'), {
      response: { status: 503, data: {} },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(serverErr) });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      retryable: true,
    });
  });

  test('HTTP 429 → retryable DISCOVERY_QUOTA_EXCEEDED', async () => {
    const quota = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } } },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(quota) });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED,
      retryable: true,
    });
  });

  test('RESOURCE_EXHAUSTED body → retryable DISCOVERY_QUOTA_EXCEEDED', async () => {
    const quota = Object.assign(new Error('exhausted'), {
      response: { status: 403, data: { error: { status: 'RESOURCE_EXHAUSTED' } } },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(quota) });
    await expect(provider.searchNearby({ center: { lat: 1, lng: 2 }, radiusMeters: 100, includedTypes: ['cafe'] }))
      .rejects.toMatchObject({ code: ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED, retryable: true });
  });

  test('HTTP 400 / INVALID_ARGUMENT → non-retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const bad = Object.assign(new Error('Bad Request'), {
      response: { status: 400, data: { error: { status: 'INVALID_ARGUMENT', message: 'bad' } } },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(bad) });
    await expect(provider.placeDetails('p', {})).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      retryable: false,
    });
  });

  test('HTTP 403 / REQUEST_DENIED → non-retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const denied = Object.assign(new Error('Forbidden'), {
      response: { status: 403, data: { error: { status: 'REQUEST_DENIED', message: 'denied' } } },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(denied) });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      retryable: false,
    });
  });
});

describe('GooglePlacesProvider — not configured', () => {
  test('isConfigured() is false and network methods throw DISCOVERY_NOT_CONFIGURED without calling http', async () => {
    const http = { request: jest.fn() };
    const provider = new GooglePlacesProvider({ apiKey: '', geocodingApiKey: '', httpClient: http });

    expect(provider.isConfigured()).toBe(false);
    await expect(
      provider.searchNearby({ center: { lat: 1, lng: 2 }, radiusMeters: 100, includedTypes: ['cafe'] }),
    ).rejects.toMatchObject({ code: ERROR_CODES.DISCOVERY_NOT_CONFIGURED, retryable: false, service: 'google-places' });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    });
    await expect(provider.placeDetails('p', {})).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    });
    await expect(provider.geocode('x')).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    });
    expect(http.request).not.toHaveBeenCalled();
  });
});

describe('GooglePlacesProvider — metrics', () => {
  test('increments the api-call metric with valid {endpoint,status:success} labels', async () => {
    const incSpy = jest.spyOn(discoveryPlacesApiCallsTotal, 'inc');
    const provider = makeProvider(okHttp({ places: [] }));
    await provider.searchNearby({ center: { lat: 1, lng: 2 }, radiusMeters: 100, includedTypes: ['cafe'] });
    expect(incSpy).toHaveBeenCalledWith({ endpoint: 'searchNearby', status: 'success' });
  });

  test('increments the metric with status "quota" on a 429', async () => {
    const incSpy = jest.spyOn(discoveryPlacesApiCallsTotal, 'inc');
    const quota = Object.assign(new Error('429'), {
      response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED' } } },
    });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(quota) });
    await expect(
      provider.searchNearby({ center: { lat: 1, lng: 2 }, radiusMeters: 100, includedTypes: ['cafe'] }),
    ).rejects.toBeDefined();
    expect(incSpy).toHaveBeenCalledWith({ endpoint: 'searchNearby', status: 'quota' });
  });

  test('increments the metric with status "error" on a failure', async () => {
    const incSpy = jest.spyOn(discoveryPlacesApiCallsTotal, 'inc');
    const bad = Object.assign(new Error('bad'), { response: { status: 400, data: {} } });
    const provider = makeProvider({ request: jest.fn().mockRejectedValue(bad) });
    await expect(provider.searchText({ textQuery: 'x' })).rejects.toBeDefined();
    expect(incSpy).toHaveBeenCalledWith({ endpoint: 'searchText', status: 'error' });
  });
});

describe('GooglePlacesProvider — geocoding', () => {
  test('uses the classic endpoint with the key as a query param (allowed) and parses the result', async () => {
    const http = okHttp({
      status: 'OK',
      results: [
        {
          formatted_address: 'Zürich, Switzerland',
          geometry: { location: { lat: 47.3769, lng: 8.5417 } },
          place_id: 'ChIJ-geo',
          address_components: [],
        },
      ],
    });
    const provider = makeProvider(http);
    const res = await provider.geocode('Zürich');

    const cfg = http.request.mock.calls[0][0];
    expect(cfg.method).toBe('GET');
    expect(cfg.url).toBe('https://maps.googleapis.com/maps/api/geocode/json');
    // Classic Geocoding API: key travels as a query param (allowed).
    expect(cfg.params.key).toBe(API_KEY);
    expect(cfg.params.address).toBe('Zürich');
    // ...but NOT in the Places (New) header-only style and NOT in the URL string.
    expect(cfg.url).not.toContain(API_KEY);

    expect(res.result.formatted_address).toBe('Zürich, Switzerland');
    expect(res.results).toHaveLength(1);
  });

  test('forwards country restrictions to autocomplete and geocoding', async () => {
    const placesHttp = okHttp({ suggestions: [] });
    const placesProvider = makeProvider(placesHttp);
    await placesProvider.autocomplete({ input: 'Paris', countryCode: 'FR' });
    expect(placesHttp.request.mock.calls[0][0].data.includedRegionCodes).toEqual(['fr']);

    const geocodeHttp = okHttp({ status: 'ZERO_RESULTS', results: [] });
    const geocodeProvider = makeProvider(geocodeHttp);
    await geocodeProvider.geocode('Paris', { countryCode: 'FR' });
    expect(geocodeHttp.request.mock.calls[0][0].params.components).toBe('country:FR');
  });

  test('OVER_QUERY_LIMIT body status → retryable DISCOVERY_QUOTA_EXCEEDED', async () => {
    const provider = makeProvider(okHttp({ status: 'OVER_QUERY_LIMIT' }));
    await expect(provider.geocode('x')).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED,
      retryable: true,
    });
  });

  test('REQUEST_DENIED body status → non-retryable DISCOVERY_PROVIDER_ERROR', async () => {
    const provider = makeProvider(okHttp({ status: 'REQUEST_DENIED', error_message: 'denied' }));
    await expect(provider.geocode('x')).rejects.toMatchObject({
      code: ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      retryable: false,
    });
  });

  test('ZERO_RESULTS is a successful empty result (not an error)', async () => {
    const provider = makeProvider(okHttp({ status: 'ZERO_RESULTS', results: [] }));
    const res = await provider.geocode('nowhere');
    expect(res.result).toBeNull();
    expect(res.results).toEqual([]);
  });
});

describe('GooglePlacesProvider — key secrecy', () => {
  test('the api key never appears in any logged output or request URL', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});

    // 1) successful Places call
    const okProvider = makeProvider(okHttp({ places: [] }));
    await okProvider.searchNearby({
      center: { lat: 1, lng: 2 },
      radiusMeters: 100,
      includedTypes: ['cafe'],
      fieldProfile: 'DISCOVERY_MINIMAL',
    });

    // 2) failing Places call whose axios error carries the key in config/url/headers
    //    (exactly what we must NOT log).
    const leakyError = Object.assign(new Error('Request failed'), {
      code: 'ERR_BAD_REQUEST',
      config: {
        url: `https://places.googleapis.com/v1/places:searchText?key=${API_KEY}`,
        headers: { 'X-Goog-Api-Key': API_KEY, Authorization: `Bearer ${API_KEY}` },
      },
      response: { status: 403, data: { error: { status: 'PERMISSION_DENIED', message: 'denied' } } },
    });
    const errProvider = makeProvider({ request: jest.fn().mockRejectedValue(leakyError) });
    await expect(errProvider.searchText({ textQuery: 'x' })).rejects.toBeDefined();

    // 3) geocode success (key lives in query params → must never be logged)
    const geoProvider = makeProvider(
      okHttp({ status: 'OK', results: [{ formatted_address: 'x', geometry: { location: { lat: 1, lng: 2 } } }] }),
    );
    await geoProvider.geocode('somewhere');

    // 4) geocode error status
    const geoErrProvider = makeProvider(okHttp({ status: 'REQUEST_DENIED' }));
    await expect(geoErrProvider.geocode('x')).rejects.toBeDefined();

    const allLogArgs = [
      ...errorSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...debugSpy.mock.calls,
    ]
      .flat()
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' || ');

    expect(allLogArgs).not.toContain(API_KEY);
  });
});

describe('OverpassProvider', () => {
  test('requests body+center output and normalizes node/way coordinates', async () => {
    const http = okHttp({
      elements: [
        { type: 'node', id: 101, lat: 48.8566, lon: 2.3522, tags: { name: 'Paris Cafe', amenity: 'restaurant' } },
        { type: 'way', id: 202, center: { lat: 48.857, lon: 2.353 }, tags: { name: 'Paris Hotel', tourism: 'hotel' } },
      ],
    });
    const provider = new OverpassProvider({
      enabled: true,
      apiUrls: ['https://overpass.test/api/interpreter'],
      httpClient: http,
    });

    const response = await provider.searchNearby({
      center: { lat: 48.8566, lng: 2.3522 },
      radiusMeters: 1000,
      osmTags: [{ key: 'amenity', value: 'restaurant' }],
      businessTypeId: 'restaurant',
      maxResultCount: 20,
    });

    const cfg = http.request.mock.calls[0][0];
    const query = new URLSearchParams(cfg.data).get('data');
    expect(query).toContain('out body center qt 20');
    expect(response.places).toHaveLength(2);
    expect(response.places[0]).toMatchObject({
      id: 'osm:node/101',
      name: 'Paris Cafe',
      location: { lat: 48.8566, lng: 2.3522 },
    });
    expect(response.places[1]).toMatchObject({
      id: 'osm:way/202',
      name: 'Paris Hotel',
      location: { lat: 48.857, lng: 2.353 },
    });
  });

  test('extracts photos from OSM image/wikimedia_commons tags and never fabricates them', async () => {
    const http = okHttp({
      elements: [
        {
          type: 'node', id: 11, lat: 48.85, lon: 2.35,
          tags: { name: 'Photo Cafe', amenity: 'cafe', image: 'https://example.com/a.jpg', wikimedia_commons: 'File:Cafe.jpg' },
        },
        { type: 'node', id: 12, lat: 48.86, lon: 2.36, tags: { name: 'No Photo Cafe', amenity: 'cafe' } },
        { type: 'node', id: 13, lat: 48.87, lon: 2.37, tags: { name: 'Bad Image', amenity: 'cafe', image: 'not-a-url' } },
      ],
    });
    const provider = new OverpassProvider({
      enabled: true,
      apiUrls: ['https://overpass.test/api/interpreter'],
      httpClient: http,
    });

    const response = await provider.searchNearby({
      center: { lat: 48.85, lng: 2.35 },
      radiusMeters: 1000,
      maxResultCount: 20,
    });

    const withPhotos = response.places.find((place) => place.id === 'osm:node/11');
    expect(withPhotos.photos).toEqual([
      { url: 'https://example.com/a.jpg', source: 'image', attribution: 'OpenStreetMap' },
      { url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cafe.jpg?width=800', source: 'wikimedia_commons', attribution: 'Wikimedia Commons' },
    ]);
    // No image tags → empty (never fabricated); an invalid image URL is ignored.
    expect(response.places.find((place) => place.id === 'osm:node/12').photos).toEqual([]);
    expect(response.places.find((place) => place.id === 'osm:node/13').photos).toEqual([]);
  });

  test('tries the next Overpass endpoint after a retryable endpoint failure', async () => {
    const networkError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const http = {
      request: jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {
            elements: [
              { type: 'node', id: 1, lat: 48.8566, lon: 2.3522, tags: { name: 'Fallback Restaurant', amenity: 'restaurant' } },
            ],
          },
        }),
    };
    const provider = new OverpassProvider({
      enabled: true,
      apiUrls: ['https://primary-overpass.test/api/interpreter', 'https://backup-overpass.test/api/interpreter'],
      httpClient: http,
    });

    const response = await provider.searchNearby({
      center: { lat: 48.8566, lng: 2.3522 },
      radiusMeters: 1000,
      osmTags: [{ key: 'amenity', value: 'restaurant' }],
    });

    expect(http.request).toHaveBeenCalledTimes(2);
    expect(http.request.mock.calls[0][0].url).toBe('https://primary-overpass.test/api/interpreter');
    expect(http.request.mock.calls[1][0].url).toBe('https://backup-overpass.test/api/interpreter');
    expect(response.places).toHaveLength(1);
  });
});

describe('NominatimProvider', () => {
  test('maps Nominatim country_code to an ISO-2 country component', async () => {
    const http = okHttp([
      {
        lat: '48.8566',
        lon: '2.3522',
        display_name: 'Paris, Île-de-France, France métropolitaine, France',
        place_id: 123,
        address: {
          city: 'Paris',
          state: 'Île-de-France',
          country: 'France',
          country_code: 'fr',
        },
      },
    ]);
    const provider = new NominatimProvider({
      enabled: true,
      apiUrl: 'https://nominatim.test',
      httpClient: http,
    });

    const response = await provider.geocode('Paris');
    const country = response.result.address_components.find((component) => component.types.includes('country'));
    const request = http.request.mock.calls[0][0];

    expect(country).toMatchObject({
      long_name: 'France',
      short_name: 'FR',
      types: ['country'],
    });
    expect(request.params['accept-language']).toBe('en');
  });
});
