/**
 * Google Places API (New) + Geocoding API provider for Business Discovery
 * (Module 15). Concrete implementation of {@link ./PlacesProvider.js}.
 *
 * Design references: LEAD_GENERATION_DESIGN.md §6 (Google integration),
 * §10 (cost/cache), §H (failure / retry taxonomy), §I (security boundary).
 *
 * ── Endpoints ──
 *  - POST https://places.googleapis.com/v1/places:searchNearby   (Places New)
 *  - POST https://places.googleapis.com/v1/places:searchText     (Places New)
 *  - POST https://places.googleapis.com/v1/places:autocomplete   (Places New)
 *  - GET  https://places.googleapis.com/v1/places/{id}           (Places New)
 *  - GET  https://maps.googleapis.com/maps/api/geocode/json      (Geocoding classic)
 *
 * ── Key secrecy (CRITICAL — §6, §I) ──
 *  - Places (New) calls authenticate with the `X-Goog-Api-Key` HEADER. Never `?key=`.
 *  - The classic Geocoding API only accepts the key as a query param; that call
 *    is allowed, but its URL/params are NEVER logged.
 *  - We never log the API key, the axios `error.config`, request URLs, or headers.
 *    On error we log only { endpoint, status, provider status/message }.
 *  - The server key never leaves the backend and is never returned in a response.
 */

import axios from 'axios';
import { PlacesProvider } from './PlacesProvider.js';
import { fieldMask } from './fieldProfiles.js';
import { DISCOVERY_PROVIDER_NAME, GEOCODING_PROVIDER_NAME } from './providerNames.js';
import config from '../../../config/index.js';
import { ExternalServiceError, ERROR_CODES } from '../../../shared/errors/errors.js';
import { discoveryPlacesApiCallsTotal } from '../../../metrics/index.js';
import logger from '../../../shared/logger/index.js';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// A sane default; the Places paid calls should fail fast rather than hang a worker.
const DEFAULT_TIMEOUT_MS = 10_000;
// Places (New) hard caps a single page at 20 results.
const MAX_RESULT_COUNT = 20;
// Default locationBias radius for autocomplete when a center is given without one.
const DEFAULT_AUTOCOMPLETE_RADIUS_M = 50_000;

const LOG_MODULE = 'businessDiscovery';

function clampResultCount(n) {
  const num = Number.isFinite(n) ? Math.trunc(n) : MAX_RESULT_COUNT;
  return Math.max(1, Math.min(num, MAX_RESULT_COUNT));
}

function toTypeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return [];
}

/** Place Details wants the mask WITHOUT the `places.` prefix the search masks use. */
function stripPlacesPrefix(mask) {
  return mask
    .split(',')
    .map((path) => path.replace(/^places\./, ''))
    .join(',');
}

function hasFiniteCenter(center) {
  return (
    center &&
    Number.isFinite(center.lat) &&
    Number.isFinite(center.lng)
  );
}

export class GooglePlacesProvider extends PlacesProvider {
  /**
   * @param {object} [deps]
   * @param {string} [deps.apiKey] - Places (New) key; defaults to config.maps.placesApiKey.
   * @param {string} [deps.geocodingApiKey] - Geocoding key; defaults to config.maps.geocodingApiKey.
   * @param {import('axios').AxiosInstance} [deps.httpClient] - injected for tests.
   */
  constructor({ apiKey, geocodingApiKey, httpClient } = {}) {
    super();
    this.name = DISCOVERY_PROVIDER_NAME.GOOGLE_PLACES;
    this.geocodingName = GEOCODING_PROVIDER_NAME.GOOGLE;
    // Null-safe config reads: the singleton is constructed at import time and must
    // NOT throw when `config.maps` is absent (e.g. unit tests that mock config, or
    // a deploy without Maps keys). It simply reports isConfigured() === false then.
    this.apiKey = apiKey !== undefined ? apiKey : config.maps?.placesApiKey;
    this.geocodingApiKey =
      geocodingApiKey !== undefined ? geocodingApiKey : config.maps?.geocodingApiKey;
    this.http = httpClient || axios.create({ timeout: DEFAULT_TIMEOUT_MS });
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  // ─────────────────────────── Places API (New) ───────────────────────────

  async searchNearby({
    center = {},
    radiusMeters,
    includedTypes,
    maxResultCount,
    rankPreference,
    fieldProfile,
  } = {}) {
    this._assertPlacesConfigured();

    const mask = fieldMask(fieldProfile || 'DISCOVERY_MINIMAL');
    const body = {
      maxResultCount: clampResultCount(maxResultCount),
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      },
    };
    const types = toTypeArray(includedTypes);
    if (types.length) body.includedTypes = types;
    if (rankPreference) body.rankPreference = rankPreference;

    const data = await this._execute('searchNearby', {
      method: 'POST',
      url: `${PLACES_BASE}/places:searchNearby`,
      headers: this._placesHeaders(mask),
      data: body,
    });
    return { places: Array.isArray(data?.places) ? data.places : [], raw: data };
  }

  async searchText({
    textQuery,
    includedType,
    center,
    radiusMeters,
    bounds,
    maxResultCount,
    pageToken,
    fieldProfile,
  } = {}) {
    this._assertPlacesConfigured();

    // Text Search needs the response-level `nextPageToken` in the field mask to
    // return a continuation token alongside the `places.*` fields.
    const mask = `nextPageToken,${fieldMask(fieldProfile || 'DISCOVERY_MINIMAL')}`;
    const body = {
      textQuery,
      pageSize: clampResultCount(maxResultCount),
    };
    if (includedType) {
      body.includedType = includedType;
      body.strictTypeFiltering = true;
    }
    const hasBounds = bounds
      && [bounds.north, bounds.south, bounds.east, bounds.west].every(Number.isFinite);
    if (hasBounds) {
      body.locationRestriction = {
        rectangle: {
          low: { latitude: bounds.south, longitude: bounds.west },
          high: { latitude: bounds.north, longitude: bounds.east },
        },
      };
    } else if (hasFiniteCenter(center)) {
      body.locationBias = {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: radiusMeters,
        },
      };
    }
    if (pageToken) body.pageToken = pageToken;

    const data = await this._execute('searchText', {
      method: 'POST',
      url: `${PLACES_BASE}/places:searchText`,
      headers: this._placesHeaders(mask),
      data: body,
    });

    const out = { places: Array.isArray(data?.places) ? data.places : [], raw: data };
    if (data?.nextPageToken) out.nextPageToken = data.nextPageToken;
    return out;
  }

  async placeDetails(placeId, { fieldProfile } = {}) {
    this._assertPlacesConfigured();
    if (!placeId) {
      const err = new ExternalServiceError(
        'google-places',
        'placeDetails requires a place id',
        ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      );
      err.retryable = false;
      throw err;
    }

    // Place Details uses the SAME field names WITHOUT the `places.` prefix.
    const mask = stripPlacesPrefix(fieldMask(fieldProfile || 'DETAILS_STANDARD'));

    const data = await this._execute('placeDetails', {
      method: 'GET',
      url: `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
      headers: this._placesHeaders(mask),
    });
    return { place: data, raw: data };
  }

  async autocomplete({ input, countryCode, sessionToken, center, radiusMeters } = {}) {
    this._assertPlacesConfigured();

    const body = { input };
    if (/^[A-Z]{2}$/.test(countryCode ?? '')) body.includedRegionCodes = [countryCode.toLowerCase()];
    if (sessionToken) body.sessionToken = sessionToken;
    if (hasFiniteCenter(center)) {
      body.locationBias = {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Number.isFinite(radiusMeters) ? radiusMeters : DEFAULT_AUTOCOMPLETE_RADIUS_M,
        },
      };
    }

    // Autocomplete (New) is not billed per field mask → no X-Goog-FieldMask header.
    const data = await this._execute('autocomplete', {
      method: 'POST',
      url: `${PLACES_BASE}/places:autocomplete`,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
      data: body,
    });
    return { predictions: Array.isArray(data?.suggestions) ? data.suggestions : [], raw: data };
  }

  // ─────────────────────────── Geocoding (classic) ───────────────────────────

  async geocode(address, { countryCode } = {}) {
    this._assertGeocodingConfigured();
    const params = { address: String(address ?? '') };
    if (/^[A-Z]{2}$/.test(countryCode ?? '')) params.components = `country:${countryCode}`;
    const data = await this._geocodeRequest(params);
    return this._toGeocodeResult(data);
  }

  async reverseGeocode({ lat, lng } = {}) {
    this._assertGeocodingConfigured();
    const data = await this._geocodeRequest({ latlng: `${lat},${lng}` });
    return this._toGeocodeResult(data);
  }

  // ─────────────────────────── internals ───────────────────────────

  _placesHeaders(mask) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.apiKey,
    };
    if (mask) headers['X-Goog-FieldMask'] = mask;
    return headers;
  }

  _assertPlacesConfigured() {
    if (!this.apiKey) throw this._notConfigured();
  }

  _assertGeocodingConfigured() {
    if (!this.geocodingApiKey) throw this._notConfigured();
  }

  _notConfigured() {
    const error = new ExternalServiceError(
      'google-places',
      'Google Maps Platform API key is not configured',
      ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    );
    error.retryable = false;
    return error;
  }

  /**
   * Execute a Places (New) request, record the metric and map any error.
   * @returns {Promise<object>} the response body.
   */
  async _execute(endpoint, requestConfig) {
    try {
      const response = await this.http.request(requestConfig);
      discoveryPlacesApiCallsTotal.inc({ endpoint, status: 'success' });
      return response?.data;
    } catch (err) {
      throw this._handleTransportError(endpoint, err);
    }
  }

  /**
   * Classic Geocoding returns HTTP 200 with a body `status` field, so success is
   * determined from the body, not just the HTTP status. The key travels as a
   * query param here (classic API limitation) and its URL/params are NEVER logged.
   * @returns {Promise<object>} the response body.
   */
  async _geocodeRequest(params) {
    const endpoint = 'geocode';
    let data;
    try {
      const response = await this.http.request({
        method: 'GET',
        url: GEOCODE_URL,
        params: { ...params, key: this.geocodingApiKey },
      });
      data = response?.data;
    } catch (err) {
      throw this._handleTransportError(endpoint, err);
    }

    const status = data?.status;
    if (status === 'OK' || status === 'ZERO_RESULTS') {
      discoveryPlacesApiCallsTotal.inc({ endpoint, status: 'success' });
      return data;
    }

    const { error, metricStatus } = this._mapGeocodeStatus(status);
    discoveryPlacesApiCallsTotal.inc({ endpoint, status: metricStatus });
    logger.error('Business discovery geocoding returned an error status', {
      module: LOG_MODULE,
      action: 'provider.geocode',
      endpoint,
      status: metricStatus,
      providerStatus: status ?? null,
      retryable: error.retryable,
    });
    throw error;
  }

  _toGeocodeResult(data) {
    const results = Array.isArray(data?.results) ? data.results : [];
    return { result: results[0] ?? null, results, raw: data };
  }

  /**
   * Map an axios/transport error to an ExternalServiceError, record the metric
   * and log ONLY safe fields (never the key, config, URL or headers).
   */
  _handleTransportError(endpoint, err) {
    const { error, metricStatus } = this._mapError(endpoint, err);
    discoveryPlacesApiCallsTotal.inc({ endpoint, status: metricStatus });
    logger.error('Business discovery provider call failed', {
      module: LOG_MODULE,
      action: `provider.${endpoint}`,
      endpoint,
      status: metricStatus,
      httpStatus: error._httpStatus ?? null,
      providerStatus: error._providerStatus ?? null,
      providerMessage: error._providerMessage ?? null,
      retryable: error.retryable,
    });
    return error;
  }

  /**
   * Failure taxonomy (design §H):
   *  - network / timeout / ECONNRESET / 5xx       → retryable, DISCOVERY_PROVIDER_ERROR
   *  - HTTP 429 / RESOURCE_EXHAUSTED              → retryable, DISCOVERY_QUOTA_EXCEEDED (metric 'quota')
   *  - HTTP 400 / 403 / REQUEST_DENIED /
   *    PERMISSION_DENIED / INVALID_ARGUMENT       → non-retryable, DISCOVERY_PROVIDER_ERROR
   */
  _mapError(endpoint, err) {
    const httpStatus = err?.response?.status ?? null;
    const providerError = err?.response?.data?.error ?? null;
    const providerStatus =
      providerError && typeof providerError === 'object' ? providerError.status ?? null : null;
    const providerMessage =
      providerError && typeof providerError === 'object' ? providerError.message ?? null : null;
    const serviceName = endpoint === 'geocode' ? 'google-geocoding' : 'google-places';

    const isQuota = httpStatus === 429 || providerStatus === 'RESOURCE_EXHAUSTED';
    const isPermanent =
      httpStatus === 400 ||
      httpStatus === 403 ||
      providerStatus === 'REQUEST_DENIED' ||
      providerStatus === 'PERMISSION_DENIED' ||
      providerStatus === 'INVALID_ARGUMENT';
    const isServer = typeof httpStatus === 'number' && httpStatus >= 500;
    const isNetwork = !err?.response; // timeout / ECONNRESET / DNS / refused

    let error;
    let metricStatus;
    if (isQuota) {
      error = new ExternalServiceError(
        serviceName,
        'Google API quota exceeded',
        ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED,
      );
      error.retryable = true;
      metricStatus = 'quota';
    } else if (isPermanent) {
      error = new ExternalServiceError(
        serviceName,
        providerMessage || 'Google API rejected the request',
        ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      );
      error.retryable = false;
      metricStatus = 'error';
    } else if (isServer || isNetwork) {
      error = new ExternalServiceError(
        serviceName,
        isNetwork ? 'Google API request failed (network or timeout)' : 'Google API server error',
        ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      );
      error.retryable = true;
      metricStatus = 'error';
    } else {
      error = new ExternalServiceError(
        serviceName,
        providerMessage || 'Google API error',
        ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      );
      error.retryable = false;
      metricStatus = 'error';
    }

    error._httpStatus = httpStatus;
    error._providerStatus = providerStatus;
    error._providerMessage = providerMessage;
    return { error, metricStatus };
  }

  _mapGeocodeStatus(status) {
    if (status === 'OVER_QUERY_LIMIT') {
      const error = new ExternalServiceError(
        'google-geocoding',
        'Geocoding API quota exceeded',
        ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED,
      );
      error.retryable = true;
      error._providerStatus = status;
      return { error, metricStatus: 'quota' };
    }
    if (status === 'UNKNOWN_ERROR') {
      const error = new ExternalServiceError(
        'google-geocoding',
        'Geocoding API temporary error',
        ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
      );
      error.retryable = true;
      error._providerStatus = status;
      return { error, metricStatus: 'error' };
    }
    // REQUEST_DENIED, INVALID_REQUEST, or anything unexpected → permanent.
    const error = new ExternalServiceError(
      'google-geocoding',
      `Geocoding API request failed (${status || 'unknown'})`,
      ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
    );
    error.retryable = false;
    error._providerStatus = status;
    return { error, metricStatus: 'error' };
  }
}

/**
 * Configured singleton built from `config.maps`. Reports `isConfigured() === false`
 * (and each network method throws DISCOVERY_NOT_CONFIGURED) until
 * GOOGLE_PLACES_API_KEY is set.
 */
export const googlePlacesProvider = new GooglePlacesProvider();

/** Accessor for the configured singleton (indirection eases later provider swap/mocking). */
export function getPlacesProvider() {
  return googlePlacesProvider;
}

export default googlePlacesProvider;
