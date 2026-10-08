import { nominatimProvider } from '../businessDiscovery/provider/NominatimProvider.js';
import { SWISS_CANTONS } from './crm.constants.js';
import logger from '../../shared/logger/index.js';

/**
 * Lead address resolution shared by every import path (Chrome extension + server
 * discovery). The provider-supplied city/country are often missing, a bare
 * postal code, or junk ("PRESS CONFERENCE"); coordinates, however, are reliable.
 * So we sanitize the supplied fields and reverse-geocode from coordinates to
 * fill a missing/invalid city or country — and NEVER default a non-Swiss lead
 * to CH (the old `|| 'CH'` fallback put Pakistani leads in Switzerland).
 */

function clean(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

const COUNTRY_NAME_TO_CODE = new Map([
  ['switzerland', 'CH'], ['schweiz', 'CH'], ['suisse', 'CH'], ['svizzera', 'CH'],
  ['france', 'FR'], ['germany', 'DE'], ['deutschland', 'DE'], ['austria', 'AT'], ['österreich', 'AT'],
  ['italy', 'IT'], ['italia', 'IT'], ['pakistan', 'PK'], ['india', 'IN'],
  ['united kingdom', 'GB'], ['uk', 'GB'], ['england', 'GB'], ['scotland', 'GB'],
  ['united states', 'US'], ['united states of america', 'US'], ['usa', 'US'], ['america', 'US'],
  ['canada', 'CA'], ['australia', 'AU'], ['united arab emirates', 'AE'], ['uae', 'AE'],
  ['spain', 'ES'], ['españa', 'ES'], ['portugal', 'PT'], ['netherlands', 'NL'], ['belgium', 'BE'],
  ['ireland', 'IE'], ['turkey', 'TR'], ['türkiye', 'TR'], ['saudi arabia', 'SA'],
  ['china', 'CN'], ['japan', 'JP'], ['bangladesh', 'BD'], ['indonesia', 'ID'],
]);

/** "Pakistan" / "pk" → "PK"; unknown → null (never a wrong guess). */
export function normalizeCountryCode(value) {
  const c = clean(value);
  if (!c) return null;
  if (/^[a-z]{2}$/i.test(c)) return c.toUpperCase();
  return COUNTRY_NAME_TO_CODE.get(c.toLocaleLowerCase('en')) || null;
}

function normalizeCanton(value, countryCode) {
  if (countryCode && countryCode !== 'CH') return null;
  const canton = clean(value)?.toUpperCase();
  return canton && SWISS_CANTONS.includes(canton) ? canton : null;
}

// Rough Swiss bounding box — only fall back to CH when coordinates are in it.
function isInSwitzerland(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 45.8 && lat <= 47.9 && lng >= 5.9 && lng <= 10.6;
}

const CITY_JUNK = /\b(press conference|visited link|add a label|results?|directions?|sponsored)\b/i;

/** A clean city name, or null for a postal code / junk / non-place text. */
export function sanitizeCity(value) {
  const s = clean(value);
  if (!s) return null;
  if (/^[\d\s-]{3,}$/.test(s)) return null; // a bare postal code is not a city
  if (CITY_JUNK.test(s)) return null;
  if ((s.match(/\p{L}/gu) || []).length < 2) return null; // a city is mostly letters
  return s.slice(0, 120);
}

// Reverse-geocode cache keyed by ~1 km rounded coordinates, plus a rolling
// per-window budget, so a bulk import issues a handful of calls (not one per
// lead) and never floods Nominatim.
const reverseCache = new Map();
const MAX_REVERSE_CALLS = Number(process.env.LEAD_LOCATION_MAX_REVERSE || 120);
const WINDOW_MS = 10 * 60 * 1000;
let reverseCalls = 0;
let windowStart = Date.now();

/** Test hook: clear cache + budget. */
export function _resetReverseBudget() {
  reverseCache.clear();
  reverseCalls = 0;
  windowStart = Date.now();
}

function withinBudget() {
  if (Date.now() - windowStart > WINDOW_MS) { windowStart = Date.now(); reverseCalls = 0; }
  return reverseCalls < MAX_REVERSE_CALLS;
}

/**
 * Best-effort location from coordinates, or null.
 * @returns {{ city, area, region, postalCode, country, street }|null}
 */
export async function resolveFromCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (typeof nominatimProvider.isConfigured === 'function' && !nominatimProvider.isConfigured()) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (reverseCache.has(key)) return reverseCache.get(key);
  if (!withinBudget()) return null;
  reverseCalls += 1;
  try {
    const { result } = await nominatimProvider.reverseGeocode({ lat, lng });
    const comps = Array.isArray(result?.address_components) ? result.address_components : [];
    const pick = (type, field = 'long_name') =>
      comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.[field] ?? null;
    // Nominatim's address_components carry raw OSM keys (city/suburb/state), not
    // Google types; the `addr` object is the reliable source for each field.
    const addr = result?.address ?? {};
    const city = sanitizeCity(
      addr.city || addr.town || addr.village || addr.municipality || addr.hamlet
        || pick('locality') || pick('postal_town'),
    );
    // Neighborhood / district — distinct from the city.
    const area = clean(
      addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter
        || addr.residential || addr.borough,
    );
    // Sub-national region (state / province), for non-Swiss addresses.
    const region = clean(addr.state || addr.province || addr.region || addr.state_district || addr.county);
    const street = clean([addr.house_number, addr.road || addr.pedestrian || addr.footway].filter(Boolean).join(' '));
    const countryShort = typeof addr.country_code === 'string' ? addr.country_code.toUpperCase() : pick('country', 'short_name');
    const country = /^[A-Z]{2}$/.test(countryShort || '') ? countryShort : normalizeCountryCode(addr.country);
    const resolved = { city, area, region, postalCode: clean(addr.postcode || pick('postal_code')), country, street };
    reverseCache.set(key, resolved);
    return resolved;
  } catch (err) {
    logger.warn('Lead location reverse-geocode failed (non-blocking)', {
      module: 'crm', action: 'lead.location', error: { message: err.message },
    });
    return null;
  }
}

/**
 * Resolve a clean, consistent lead address. Provider fields come first; a
 * missing/invalid city, area, region, postal code or country is then filled by
 * reverse-geocoding from coordinates (the reliable signal).
 * @returns {{ street, addressSupplement, area, city, postalCode, canton, region, country, formatted }}
 */
export async function resolveLeadAddress(input = {}) {
  const { street, city, area, postalCode, canton, state, region, country, formatted, latitude, longitude } = input;
  let outCountry = normalizeCountryCode(country);
  let outCity = sanitizeCity(city);
  let outArea = clean(area);
  let outRegion = clean(region) ?? clean(state);
  let outPostal = clean(postalCode);
  let outStreet = clean(street);

  // Geocode only when a CORE field (city/country) is missing/invalid — the
  // cost guarantee for well-formed leads. When it fires, area/region/street are
  // filled opportunistically from the same call; the rate-limited backfill
  // migration enriches area/region for leads that already had a good city.
  if ((!outCity || !outCountry)
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    const geo = await resolveFromCoordinates(latitude, longitude);
    if (geo) {
      if (!outCity) outCity = geo.city;
      if (!outArea) outArea = geo.area;
      if (!outRegion) outRegion = geo.region;
      if (!outCountry) outCountry = geo.country;
      if (!outPostal) outPostal = geo.postalCode;
      if (!outStreet) outStreet = geo.street;
    }
  }

  // Only use CH when coordinates genuinely fall in Switzerland — never as a
  // blanket default for leads whose country could not be determined.
  if (!outCountry && isInSwitzerland(Number(latitude), Number(longitude))) outCountry = 'CH';

  // `area` must never be a bare postal code (sanitizeCity rejects those too).
  if (outArea && /^[\d\s-]{3,}$/.test(outArea)) outArea = null;

  return {
    street: outStreet,
    addressSupplement: null,
    area: outArea,
    city: outCity,
    postalCode: outPostal,
    canton: normalizeCanton(canton ?? state, outCountry),
    // Swiss sub-national admin is the canton; `region` carries the non-Swiss
    // state/province so the two never duplicate.
    region: outCountry === 'CH' ? null : outRegion,
    country: outCountry,
    formatted: clean(formatted),
  };
}
