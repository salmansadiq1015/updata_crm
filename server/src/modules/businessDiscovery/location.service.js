/**
 * Location service for Business Discovery (Module 15).
 *
 * Thin, provider-agnostic layer over the Places provider for the two
 * location-resolution needs of the discovery UI:
 *  - `resolveLocation(query)`  — geocode an address/place string → a center,
 *    bounds and components DTO the frontend and CoveragePlanner can use.
 *  - `autocomplete(input, …)`  — location search-box suggestions.
 *
 * Both are cached via {@link CacheManager} (design §10): geocoding for hours,
 * autocomplete briefly. Cache keys are namespaced `discovery:*` and the
 * autocomplete key is intentionally session-token-INDEPENDENT so suggestions are
 * shared across sessions. Returns provider-agnostic DTOs; never logs keys/URLs.
 */

import cacheManager from '../../shared/cache/CacheManager.js';
import { getGeocodingProvider } from './provider/providerFactory.js';
import { ValidationError } from '../../shared/errors/errors.js';

// Geocoding is stable → cache for hours. Autocomplete is cheap/volatile → short.
const GEOCODE_TTL = { l1Ttl: 3600, l2Ttl: 24 * 3600 };
const AUTOCOMPLETE_TTL = { l1Ttl: 30, l2Ttl: 120 };

/** Normalize a query for a stable cache key: trim, lowercase, collapse whitespace. */
function normalizeQuery(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Coarse center key (~1km) so a biased autocomplete does not collide across cities. */
function centerKey(center) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return 'nobias';
  return `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
}

/** Map one classic-Geocoding result → a provider-agnostic location DTO. */
function toLocationDto(result) {
  if (!result || typeof result !== 'object') return null;
  const location = result.geometry?.location ?? {};
  const viewport = result.geometry?.viewport ?? result.geometry?.bounds ?? null;
  const lat = Number.isFinite(location.lat) ? location.lat : null;
  const lng = Number.isFinite(location.lng) ? location.lng : null;
  const components = Array.isArray(result.address_components) ? result.address_components : [];
  const component = (...types) => components.find((entry) =>
    types.some((type) => Array.isArray(entry?.types) && entry.types.includes(type)));
  const country = component('country');
  const region = component('administrative_area_level_1');
  const city = component('locality', 'postal_town', 'administrative_area_level_2');
  return {
    name: result.formatted_address ?? null,
    center: { lat, lng },
    bounds: viewport
      ? { northeast: viewport.northeast ?? null, southwest: viewport.southwest ?? null }
      : null,
    components,
    formattedAddress: result.formatted_address ?? null,
    placeId: result.place_id ?? null,
    countryCode: country?.short_name ?? null,
    country: country?.long_name ?? null,
    region: region?.long_name ?? null,
    city: city?.long_name ?? null,
  };
}

/** Map one Places (New) autocomplete suggestion → a provider-agnostic prediction DTO. */
function toPredictionDto(suggestion) {
  const prediction = suggestion?.placePrediction ?? {};
  const structured = prediction.structuredFormat ?? {};
  return {
    placeId: prediction.placeId ?? null,
    description: prediction.text?.text ?? null,
    mainText: structured.mainText?.text ?? null,
    secondaryText: structured.secondaryText?.text ?? null,
    types: Array.isArray(prediction.types) ? prediction.types : [],
  };
}

class LocationService {
  /**
   * Geocode an address/place string.
   * @param {string} query
   * @returns {Promise<object|null>} location DTO, or null when nothing matched.
   */
  async resolveLocation(query) {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q) throw new ValidationError('A location query is required');

    const cacheKey = `discovery:geocode:${normalizeQuery(q)}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const { result } = await getGeocodingProvider().geocode(q);
        return toLocationDto(result);
      },
      GEOCODE_TTL,
    );
  }

  /**
   * Location autocomplete suggestions.
   * @param {string} input
   * @param {object} [opts]
   * @param {string} [opts.sessionToken] - forwarded to the provider, NOT part of the cache key.
   * @param {{lat:number,lng:number}} [opts.center] - optional location bias.
   * @returns {Promise<{ predictions: object[] }>}
   */
  async autocomplete(input, { sessionToken, center } = {}) {
    const q = typeof input === 'string' ? input.trim() : '';
    if (!q) return { predictions: [] };

    // Session-token-independent key: suggestions are shared across sessions.
    const cacheKey = `discovery:autocomplete:${normalizeQuery(q)}:${centerKey(center)}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const { predictions } = await getGeocodingProvider().autocomplete({
          input: q,
          sessionToken,
          center,
        });
        return { predictions: predictions.map(toPredictionDto) };
      },
      AUTOCOMPLETE_TTL,
    );
  }

  /**
   * Reverse geocode coordinates → a location DTO.
   * @param {{lat:number,lng:number}} coords
   * @returns {Promise<object|null>}
   */
  async reverseGeocode({ lat, lng } = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ValidationError('Valid lat/lng coordinates are required');
    }
    const cacheKey = `discovery:reverse-geocode:${lat.toFixed(5)},${lng.toFixed(5)}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const { result } = await getGeocodingProvider().reverseGeocode({ lat, lng });
        return toLocationDto(result);
      },
      GEOCODE_TTL,
    );
  }
}

const locationService = new LocationService();
export default locationService;
