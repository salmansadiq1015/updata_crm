import { nominatimProvider } from '../businessDiscovery/provider/NominatimProvider.js';
import { SWISS_CANTONS } from './crm.constants.js';
import logger from '../../shared/logger/index.js';
import {
  canonicalizeLeadAddress, needsGeoRepair, normalizeCountryCode, normalizeGeographyKey, preferLatinScript,
} from './leadGeography.js';

export { normalizeCountryCode } from './leadGeography.js';

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

/**
 * Parse a free-text selected search location ("Lahore", "Lahore, Pakistan",
 * "Casablanca, Casablanca-Settat, Morocco") into a best-effort { city, country }.
 *
 * This is the shared fallback used by every import path when a business's own
 * city/country could not be extracted or reverse-geocoded. It is deliberately
 * conservative — it only returns a value it can identify RELIABLY and never
 * invents one:
 *   - country: only when the last comma segment is a known country name/code.
 *   - city:    only the first segment, and only when it reads like a place name
 *              (sanitizeCity: letters, not a postal code, not UI junk) and is not
 *              itself a country. A lone "Pakistan" yields a country, not a city.
 * @returns {{ city: string|null, country: string|null }}
 */
export function parseLocationString(value) {
  const s = clean(value);
  if (!s) return { city: null, country: null };
  const parts = s.split(',').map((part) => clean(part)).filter(Boolean);
  if (!parts.length) return { city: null, country: null };

  let country = null;
  let cityParts = parts;
  // A trailing country segment ("…, Pakistan") names the country; the rest holds
  // the city. With a single segment, decide whether it is a country or a city.
  const last = normalizeCountryCode(parts[parts.length - 1]);
  if (last) {
    country = last;
    cityParts = parts.slice(0, -1);
  }

  let city = null;
  const first = cityParts[0];
  // Never treat a country name as the city ("Pakistan" alone → country only).
  if (first && !normalizeCountryCode(first)) city = sanitizeCity(first);

  return { city, country };
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

// "Lahore District" / "District of Lahore" / "Lahore Tehsil" → "Lahore".
function metroFromAdmin(value) {
  const text = preferLatinScript(clean(value));
  if (!text) return null;
  const match = text.match(/^(.+?)\s+(?:district|tehsil)$/iu) ?? text.match(/^district of\s+(.+)$/iu);
  return match ? clean(match[1]) : null;
}

/**
 * Turn a Nominatim reverse result into clean, English address parts.
 *
 * OSM tags many metro neighbourhoods as their own village/hamlet (Bahria Town
 * → "Tarogill", Wapda Town → "Khumbe", both in "Lahore District"). Reported as
 * the city, each suburb became its own "city" in the filters. When there is no
 * `city` and the place is a village/hamlet — or a town named after its district
 * ("Lahore Cant") — the district's city is used and the place becomes the area.
 * A genuine town (e.g. Bouznika) stays the city.
 */
export function addressFromNominatim(result) {
  const comps = Array.isArray(result?.address_components) ? result.address_components : [];
  const pick = (type, field = 'long_name') =>
    comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.[field] ?? null;
  // Nominatim's address_components carry raw OSM keys (city/suburb/state), not
  // Google types; the `addr` object is the reliable source for each field.
  const addr = result?.address ?? {};
  const latin = (value) => preferLatinScript(clean(value));
  const metro = metroFromAdmin(addr.county) ?? metroFromAdmin(addr.state_district);

  let city = latin(addr.city);
  let placeArea = null;
  if (!city) {
    const town = latin(addr.town);
    const small = latin(addr.village || addr.hamlet);
    const metroKey = normalizeGeographyKey(metro);
    if (metro && !town && small) {
      city = metro;
      placeArea = small;
    } else if (metro && town && metroKey && normalizeGeographyKey(town).startsWith(metroKey)) {
      city = metro;
      placeArea = town;
    } else if (metro && !town && !small) {
      // Only an administrative unit ("Model Town Tehsil") — never a city.
      city = metro;
    } else {
      const municipality = metroFromAdmin(addr.municipality) ? null : latin(addr.municipality);
      city = town || small || municipality || latin(pick('locality')) || latin(pick('postal_town'));
    }
  }
  city = sanitizeCity(city);
  // Neighborhood / district — distinct from the city.
  const area = latin(
    addr.suburb || addr.neighbourhood
      || (normalizeGeographyKey(addr.city_district) !== normalizeGeographyKey(city) ? addr.city_district : null)
      || addr.quarter || addr.residential || addr.borough,
  ) ?? placeArea;
  // Sub-national region (state / province), for non-Swiss addresses.
  const region = latin(addr.state || addr.province || addr.region || addr.state_district || addr.county);
  const street = clean([addr.house_number, addr.road || addr.pedestrian || addr.footway].filter(Boolean).join(' '));
  const countryShort = typeof addr.country_code === 'string' ? addr.country_code.toUpperCase() : pick('country', 'short_name');
  const country = /^[A-Z]{2}$/.test(countryShort || '') ? countryShort : normalizeCountryCode(addr.country);
  return { city, area, region, postalCode: clean(addr.postcode || pick('postal_code')), country, street };
}
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
    const resolved = addressFromNominatim(result);
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
 * reverse-geocoding from coordinates (the reliable signal); and finally, any
 * CITY or COUNTRY still unresolved is filled from the user's SELECTED SEARCH
 * LOCATION (e.g. the "Lahore" typed into the discovery/extension form) — each
 * field independently, never overwriting a value already resolved and never
 * inventing one the fallback cannot identify.
 *
 * Fallback inputs (all optional): `fallbackCity` / `fallbackCountry` are
 * structured hints (the discovery session's parsed city / countryCode) and
 * `fallbackLocation` is the raw free-text location, parsed on demand.
 * @returns {{ street, addressSupplement, area, city, postalCode, canton, region, country, formatted }}
 */
export async function resolveLeadAddress(input = {}) {
  const {
    street, city, area, postalCode, canton, state, region, country, formatted, latitude, longitude,
    fallbackLocation, fallbackCity, fallbackCountry,
  } = input;
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
  // A city/area written only in a non-Latin script or that is not a place
  // ("A Rosewood Hotel · Visited link") is repaired the same way, so it never
  // becomes its own filter option.
  const badCity = Boolean(outCity) && needsGeoRepair(outCity);
  const badArea = Boolean(outArea) && needsGeoRepair(outArea);
  if ((!outCity || !outCountry || badCity || badArea)
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    const geo = await resolveFromCoordinates(latitude, longitude);
    if (geo) {
      const replaceCity = (!outCity || badCity) && Boolean(geo.city);
      if (replaceCity) outCity = geo.city;
      if (!outArea || badArea || replaceCity) outArea = geo.area ?? (badArea ? null : outArea);
      if (!outRegion) outRegion = geo.region;
      if (!outCountry) outCountry = geo.country;
      if (!outPostal) outPostal = geo.postalCode;
      if (!outStreet) outStreet = geo.street;
    }
  }

  // Only use CH when coordinates genuinely fall in Switzerland — never as a
  // blanket default for leads whose country could not be determined. Coordinate
  // signals (reverse-geocode + this CH bounding box) always take precedence over
  // the coarser text fallback below.
  if (!outCountry && isInSwitzerland(Number(latitude), Number(longitude))) outCountry = 'CH';

  // Final fallback: the user's selected search location. Applied ONLY to a city
  // or country still unresolved — each independently, so an accurate value from
  // the business's own data or its coordinates is never overwritten. Prefer the
  // structured hints, then parse the free-text location.
  if (!outCity || !outCountry) {
    const parsed = clean(fallbackLocation) ? parseLocationString(fallbackLocation) : { city: null, country: null };
    if (!outCity) outCity = sanitizeCity(fallbackCity) ?? parsed.city;
    if (!outCountry) outCountry = normalizeCountryCode(fallbackCountry) ?? parsed.country;
  }

  // `area` must never be a bare postal code (sanitizeCity rejects those too).
  if (outArea && /^[\d\s-]{3,}$/.test(outArea)) outArea = null;

  return canonicalizeLeadAddress({
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
  }, { source: input.source || 'resolver' });
}
