import axios from 'axios';
import { PlacesProvider } from './PlacesProvider.js';
import { DISCOVERY_PROVIDER_NAME } from './providerNames.js';
import config from '../../../config/index.js';
import { ExternalServiceError, ERROR_CODES } from '../../../shared/errors/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 20;
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function clampLimit(value) {
  const n = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, 100));
}

function escapeOverpassString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function hasFiniteCenter(center) {
  return center && Number.isFinite(center.lat) && Number.isFinite(center.lng);
}

function tagSelector(tag) {
  if (!tag?.key) return null;
  const key = escapeOverpassString(tag.key);
  if (tag.value === undefined || tag.value === null || tag.value === '') return `["${key}"]`;
  return `["${key}"="${escapeOverpassString(tag.value)}"]`;
}

function areaSelector({ center, radiusMeters, bounds } = {}) {
  const hasBounds = bounds
    && [bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite);
  if (hasBounds) return `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  if (hasFiniteCenter(center)) return `(around:${Math.max(1, Math.trunc(radiusMeters || 1000))},${center.lat},${center.lng})`;
  return null;
}

function keywordFilter(keyword) {
  const q = escapeOverpassString(String(keyword ?? '').trim());
  if (!q) return '';
  const fields = ['name', 'brand', 'operator', 'cuisine', 'description'];
  return `[~"${fields.join('|')}"~"${q}",i]`;
}

function firstTag(tags = {}, keys = []) {
  for (const key of keys) {
    const value = tags[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function formatAddress(tags = {}) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ').trim() || null;
  const city = firstTag(tags, ['addr:city', 'addr:town', 'addr:village', 'addr:municipality']);
  const postcode = tags['addr:postcode'] || null;
  const country = tags['addr:country'] || null;
  return {
    formatted: [street, postcode, city, country].filter(Boolean).join(', ') || null,
    street,
    city,
    region: tags['addr:province'] || tags['addr:state'] || null,
    postalCode: postcode,
    country,
  };
}

function normalizeOsmElement(element, { typeId, textQuery } = {}) {
  const tags = element?.tags || {};
  const lat = Number.isFinite(element?.lat) ? element.lat : element?.center?.lat;
  const lng = Number.isFinite(element?.lon) ? element.lon : element?.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const osmType = element.type;
  const osmId = element.id;
  const providerPlaceId = `osm:${osmType}/${osmId}`;
  const primaryType =
    typeId
    || tags.amenity
    || tags.tourism
    || tags.shop
    || tags.office
    || tags.leisure
    || tags.healthcare
    || tags.craft
    || null;

  const website = firstTag(tags, ['website', 'contact:website', 'url']);
  const phone = firstTag(tags, ['phone', 'contact:phone']);
  const email = firstTag(tags, ['email', 'contact:email']);
  const address = formatAddress(tags);

  return {
    id: providerPlaceId,
    placeId: providerPlaceId,
    provider: { name: DISCOVERY_PROVIDER_NAME.OPENSTREETMAP, placeId: providerPlaceId },
    providerName: DISCOVERY_PROVIDER_NAME.OPENSTREETMAP,
    source: 'OPENSTREETMAP',
    osmType,
    osmId,
    osmTags: tags,
    name: tags.name || tags.brand || tags.operator || textQuery || null,
    primaryType,
    types: [primaryType, tags.amenity, tags.tourism, tags.shop, tags.office, tags.leisure, tags.healthcare, tags.craft]
      .filter(Boolean),
    phone,
    internationalPhone: firstTag(tags, ['contact:mobile', 'mobile']) || null,
    website,
    email,
    address,
    location: { lat, lng },
    openingHours: tags.opening_hours || null,
    mapsUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
  };
}

export class OverpassProvider extends PlacesProvider {
  constructor({ apiUrl, httpClient, timeoutMs, userAgent, enabled } = {}) {
    super();
    this.name = DISCOVERY_PROVIDER_NAME.OPENSTREETMAP;
    this.apiUrl = apiUrl !== undefined
      ? apiUrl
      : (config.discovery?.endpoints?.overpassUrl || DEFAULT_OVERPASS_URL);
    this.enabled = enabled !== undefined
      ? enabled
      : Boolean(config.discovery?.providers?.openStreetMapEnabled && config.discovery?.providers?.overpassEnabled);
    this.userAgent = userAgent || config.discovery?.userAgent || 'UpdataCRM-Discovery/1.0';
    this.http = httpClient || axios.create({ timeout: timeoutMs || config.discovery?.requestTimeoutMs || DEFAULT_TIMEOUT_MS });
  }

  isConfigured() {
    return Boolean(this.enabled && this.apiUrl);
  }

  async searchNearby({ center, radiusMeters, osmTags, businessTypeId, keyword, maxResultCount } = {}) {
    return this._search({
      center,
      radiusMeters,
      osmTags,
      typeId: businessTypeId,
      textQuery: keyword,
      maxResultCount,
    });
  }

  async searchText({ textQuery, center, radiusMeters, bounds, osmTags, businessTypeId, keyword, maxResultCount } = {}) {
    return this._search({
      center,
      radiusMeters,
      bounds,
      osmTags,
      typeId: businessTypeId,
      textQuery,
      keyword: keyword || textQuery,
      maxResultCount,
    });
  }

  async placeDetails(placeId) {
    if (!placeId) return { place: null, raw: null };
    return { place: null, raw: null };
  }

  async _search({ center, radiusMeters, bounds, osmTags = [], typeId, textQuery, keyword, maxResultCount } = {}) {
    this._assertConfigured();
    const area = areaSelector({ center, radiusMeters, bounds });
    if (!area) return { places: [], raw: { elements: [] } };

    const tags = Array.isArray(osmTags) ? osmTags.filter(Boolean) : [];
    const limit = clampLimit(maxResultCount);
    const filter = keywordFilter(keyword ?? textQuery);
    const selectors = tags.length
      ? tags.map((tag) => {
          const selector = tagSelector(tag);
          return selector ? `nwr${selector}${filter}${area};` : null;
        }).filter(Boolean)
      : [
          `nwr["name"]${filter || ''}${area};`,
          `nwr["brand"]${filter || ''}${area};`,
          `nwr["operator"]${filter || ''}${area};`,
        ];

    if (!selectors.length) return { places: [], raw: { elements: [] } };

    const query = `[out:json][timeout:${Math.ceil((config.discovery?.requestTimeoutMs || DEFAULT_TIMEOUT_MS) / 1000)}];(${selectors.join('')});out tags center qt ${limit};`;
    const raw = await this._execute(query);
    const elements = Array.isArray(raw?.elements) ? raw.elements : [];
    const places = elements
      .map((element) => normalizeOsmElement(element, { typeId, textQuery }))
      .filter(Boolean);
    return { places, raw };
  }

  async _execute(query) {
    try {
      const response = await this.http.request({
        method: 'POST',
        url: this.apiUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        data: new URLSearchParams({ data: query }).toString(),
      });
      return response?.data;
    } catch (err) {
      throw this._mapError(err);
    }
  }

  _assertConfigured() {
    if (this.isConfigured()) return;
    const error = new ExternalServiceError(
      'overpass',
      'Overpass provider is not configured',
      ERROR_CODES.DISCOVERY_NOT_CONFIGURED,
    );
    error.retryable = false;
    throw error;
  }

  _mapError(err) {
    const status = err?.response?.status ?? null;
    const isQuota = status === 429 || status === 509;
    const isServer = typeof status === 'number' && status >= 500;
    const error = new ExternalServiceError(
      'overpass',
      isQuota ? 'Overpass rate limit exceeded' : 'Overpass request failed',
      isQuota ? ERROR_CODES.DISCOVERY_QUOTA_EXCEEDED : ERROR_CODES.DISCOVERY_PROVIDER_ERROR,
    );
    error.retryable = isQuota || isServer || !err?.response;
    error._httpStatus = status;
    return error;
  }
}

export const overpassProvider = new OverpassProvider();

export default overpassProvider;
