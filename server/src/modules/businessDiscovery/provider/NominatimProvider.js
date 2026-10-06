import axios from 'axios';
import { PlacesProvider } from './PlacesProvider.js';
import { GEOCODING_PROVIDER_NAME } from './providerNames.js';
import config from '../../../config/index.js';
import { ExternalServiceError, ERROR_CODES } from '../../../shared/errors/errors.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_URL = 'https://nominatim.openstreetmap.org';

function trimBaseUrl(url) {
  return String(url || DEFAULT_URL).replace(/\/+$/, '');
}

function bboxToViewport(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [south, north, west, east] = bbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return {
    northeast: { lat: north, lng: east },
    southwest: { lat: south, lng: west },
  };
}

function addressComponents(address = {}) {
  return Object.entries(address)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      long_name: String(value),
      short_name: String(value),
      types: [key],
    }));
}

function toGoogleLikeResult(row) {
  if (!row || typeof row !== 'object') return null;
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = row.address || {};
  return {
    formatted_address: row.display_name || row.name || null,
    place_id: row.osm_type && row.osm_id ? `osm:${row.osm_type}/${row.osm_id}` : row.place_id ? `nominatim:${row.place_id}` : null,
    provider: { name: GEOCODING_PROVIDER_NAME.NOMINATIM },
    geometry: {
      location: { lat, lng },
      viewport: bboxToViewport(row.boundingbox),
    },
    address_components: addressComponents(address),
    address,
    types: [row.class, row.type].filter(Boolean),
  };
}

function toPrediction(row) {
  const result = toGoogleLikeResult(row);
  if (!result) return null;
  const address = row.address || {};
  const main = row.name || address.city || address.town || address.village || result.formatted_address;
  const secondary = result.formatted_address && main
    ? result.formatted_address.replace(String(main), '').replace(/^,\s*/, '')
    : null;
  return {
    placePrediction: {
      placeId: result.place_id,
      text: { text: result.formatted_address },
      structuredFormat: {
        mainText: { text: main || result.formatted_address },
        secondaryText: { text: secondary || '' },
      },
      types: result.types,
    },
  };
}

export class NominatimProvider extends PlacesProvider {
  constructor({ apiUrl, httpClient, timeoutMs, userAgent, enabled, allowAutocomplete } = {}) {
    super();
    this.name = GEOCODING_PROVIDER_NAME.NOMINATIM;
    this.apiUrl = trimBaseUrl(apiUrl !== undefined ? apiUrl : config.discovery?.endpoints?.nominatimUrl);
    this.enabled = enabled !== undefined ? enabled : Boolean(config.discovery?.providers?.nominatimEnabled);
    this.allowAutocomplete = allowAutocomplete !== undefined
      ? allowAutocomplete
      : this.apiUrl !== DEFAULT_URL;
    this.userAgent = userAgent || config.discovery?.userAgent || 'UpdataCRM-Discovery/1.0';
    this.http = httpClient || axios.create({ timeout: timeoutMs || config.discovery?.requestTimeoutMs || DEFAULT_TIMEOUT_MS });
  }

  isConfigured() {
    return Boolean(this.enabled && this.apiUrl);
  }

  async geocode(address) {
    this._assertConfigured();
    const q = String(address ?? '').trim();
    if (!q) return { result: null, results: [], raw: [] };
    const data = await this._execute('/search', {
      q,
      format: 'jsonv2',
      addressdetails: 1,
      limit: 5,
    });
    const results = (Array.isArray(data) ? data : []).map(toGoogleLikeResult).filter(Boolean);
    return { result: results[0] || null, results, raw: data };
  }

  async reverseGeocode({ lat, lng } = {}) {
    this._assertConfigured();
    const data = await this._execute('/reverse', {
      lat,
      lon: lng,
      format: 'jsonv2',
      addressdetails: 1,
    });
    const result = toGoogleLikeResult(data);
    return { result, results: result ? [result] : [], raw: data };
  }

  async autocomplete({ input } = {}) {
    if (!this.allowAutocomplete) return { predictions: [], raw: [] };
    const { results, raw } = await this.geocode(input);
    return {
      predictions: results.map((result, index) => toPrediction(Array.isArray(raw) ? raw[index] : result)).filter(Boolean),
      raw,
    };
  }

  async _execute(path, params) {
    try {
      const response = await this.http.request({
        method: 'GET',
        url: `${this.apiUrl}${path}`,
        params,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });
      return response?.data;
    } catch (err) {
      throw this._mapError(err);
    }
  }

  _assertConfigured() {
    if (this.isConfigured()) return;
    const error = new ExternalServiceError(
      'nominatim',
      'Nominatim provider is not configured',
      ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    );
    error.retryable = false;
    throw error;
  }

  _mapError(err) {
    const status = err?.response?.status ?? null;
    const isQuota = status === 429;
    const isServer = typeof status === 'number' && status >= 500;
    const error = new ExternalServiceError(
      'nominatim',
      isQuota ? 'Nominatim rate limit exceeded' : 'Nominatim request failed',
      isQuota ? ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED : ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
    );
    error.retryable = isQuota || isServer || !err?.response;
    error._httpStatus = status;
    return error;
  }
}

export const nominatimProvider = new NominatimProvider();

export default nominatimProvider;
