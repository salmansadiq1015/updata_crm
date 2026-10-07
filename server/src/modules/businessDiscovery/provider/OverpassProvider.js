import axios from 'axios';
import { PlacesProvider } from './PlacesProvider.js';
import { DISCOVERY_PROVIDER_NAME } from './providerNames.js';
import config from '../../../config/index.js';
import { ExternalServiceError, ERROR_CODES } from '../../../shared/errors/errors.js';

const DEFAULT_TIMEOUT_MS = 30_000;
// OSM/Overpass returns every matching element in one response (it is not a
// paged API like Google). A generous per-request page size lets a cell surface
// everything OSM has instead of being throttled to a Google-sized 20; the
// adaptive sweep still subdivides any cell that saturates this limit.
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
// Advertised to the adaptive search so it requests a full OSM page per cell
// (and only subdivides when a cell truly saturates this size).
export const OVERPASS_SEARCH_PAGE_SIZE = DEFAULT_LIMIT;
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const FALLBACK_OVERPASS_URLS = Object.freeze([
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]);

function uniqueUrls(urls = []) {
  const seen = new Set();
  return urls
    .map((url) => String(url || '').trim())
    .filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function clampLimit(value) {
  const n = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, MAX_LIMIT));
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

const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Build photo references from the OSM tags that actually carry imagery
 * (`image` / `image:N` direct URLs and `wikimedia_commons` File: entries).
 * Never fabricated — returns an empty array when the element has no image tags.
 * Wikimedia Commons files resolve through Special:FilePath, which redirects to
 * the real image and accepts a `width` hint for a thumbnail.
 */
function extractOsmPhotos(tags = {}) {
  const photos = [];
  const seen = new Set();
  const push = (url, source) => {
    if (!url || seen.has(url) || photos.length >= 10) return;
    seen.add(url);
    photos.push({ url, source, attribution: source === 'wikimedia_commons' ? 'Wikimedia Commons' : 'OpenStreetMap' });
  };

  for (const [key, value] of Object.entries(tags)) {
    if ((key === 'image' || /^image:\d+$/.test(key)) && HTTP_URL_RE.test(String(value))) {
      push(String(value).trim(), 'image');
    }
  }

  const commons = tags.wikimedia_commons;
  if (typeof commons === 'string' && /^File:/i.test(commons.trim())) {
    const fileName = commons.trim().replace(/^File:/i, '');
    if (fileName) {
      push(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=800`, 'wikimedia_commons');
    }
  }

  return photos;
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
    photos: extractOsmPhotos(tags),
    mapsUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
  };
}

export class OverpassProvider extends PlacesProvider {
  constructor({ apiUrl, apiUrls, httpClient, timeoutMs, userAgent, enabled } = {}) {
    super();
    this.name = DISCOVERY_PROVIDER_NAME.OPENSTREETMAP;
    // OSM is not paged — one request returns the whole cell. Tell the adaptive
    // search to request a full page per cell (vs Google's 20) so a dense area is
    // surfaced in far fewer requests, with subdivision only on real saturation.
    this.searchPageSize = OVERPASS_SEARCH_PAGE_SIZE;
    this.apiUrls = uniqueUrls(
      apiUrls
      ?? [
        apiUrl !== undefined
          ? apiUrl
          : (config.discovery?.endpoints?.overpassUrl || DEFAULT_OVERPASS_URL),
        ...(config.discovery?.endpoints?.overpassUrls || []),
        ...FALLBACK_OVERPASS_URLS,
      ],
    );
    this.apiUrl = this.apiUrls[0] || '';
    this.enabled = enabled !== undefined
      ? enabled
      : Boolean(config.discovery?.providers?.openStreetMapEnabled && config.discovery?.providers?.overpassEnabled);
    this.userAgent = userAgent || config.discovery?.userAgent || 'UpdataCRM-Discovery/1.0';
    this.http = httpClient || axios.create({ timeout: timeoutMs || config.discovery?.requestTimeoutMs || DEFAULT_TIMEOUT_MS });
  }

  isConfigured() {
    return Boolean(this.enabled && this.apiUrls.length > 0);
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

    const query = `[out:json][timeout:${Math.ceil((config.discovery?.requestTimeoutMs || DEFAULT_TIMEOUT_MS) / 1000)}];(${selectors.join('')});out body center qt ${limit};`;
    const raw = await this._execute(query);
    const elements = Array.isArray(raw?.elements) ? raw.elements : [];
    const places = elements
      .map((element) => normalizeOsmElement(element, { typeId, textQuery }))
      .filter(Boolean);
    return { places, raw };
  }

  async _execute(query) {
    let lastError = null;
    for (const url of this.apiUrls) {
      try {
        const response = await this.http.request({
          method: 'POST',
          url,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': this.userAgent,
          },
          data: new URLSearchParams({ data: query }).toString(),
        });
        return response?.data;
      } catch (err) {
        const mapped = this._mapError(err, url);
        lastError = mapped;
        if (!mapped.retryable) break;
      }
    }
    throw lastError || this._mapError(new Error('Overpass request failed'));
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

  _mapError(err, endpoint = null) {
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
    error.endpoint = endpoint;
    return error;
  }
}

export const overpassProvider = new OverpassProvider();

export default overpassProvider;
