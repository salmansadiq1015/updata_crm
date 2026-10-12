/**
 * Normalization helpers for Business Discovery (Module 15).
 *
 * Pure, dependency-free. Turns provider payloads and user input into the stable
 * shapes the discovery pipeline compares and persists.
 *
 * References: LEAD_GENERATION_DESIGN.md §4.2 (business sub-doc), §6 (maps URL),
 * §8 (dedup normalization). Phone normalization is pragmatic/heuristic — the
 * libphonenumber library is intentionally NOT a dependency here (see
 * {@link normalizePhone}). Original values are preserved elsewhere; the
 * `normalized*` fields exist only for comparison/dedup.
 */

import { PHONE_PATTERN, SWISS_CANTONS } from '../../crm/crm.constants.js';

/**
 * Minimal country dialing metadata for the pragmatic phone normalizer. `code` is
 * the country calling code (digits, no `+`); `trunk` is the national trunk
 * prefix stripped/added when rendering the national form. Default region is CH.
 */
const COUNTRY_CODES = Object.freeze({
  CH: { code: '41', trunk: '0' },
  LI: { code: '423', trunk: '0' },
  DE: { code: '49', trunk: '0' },
  AT: { code: '43', trunk: '0' },
  FR: { code: '33', trunk: '0' },
  IT: { code: '39', trunk: '0' },
  US: { code: '1', trunk: '' },
});

const pick = (...values) => {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const numberOrNull = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/**
 * Normalize a business/display name for comparison only: trim, collapse internal
 * whitespace, lowercase, fold diacritics, and map German `ß` → `ss`. The
 * original (display) name must be kept separately.
 */
export function normalizeName(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFKD') // split base letters from combining diacritics
    .replace(/[̀-ͯ]/g, '') // drop combining marks (é → e, ä → a)
    .replace(/ß/g, 'ss') // ß → ss (German orthography)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pragmatic international phone normalizer. NOT a naive `\D` strip and NOT
 * libphonenumber (which is not installed) — a documented heuristic:
 *  - keeps a leading `+` (already E.164-ish);
 *  - `00` international prefix → `+`;
 *  - a national number with a leading trunk `0` → prepend the region's calling
 *    code (default region `CH` → `+41`);
 *  - a bare number already starting with the region code → add `+`.
 *
 * Validity is a shape check (E.164 length 8–15 digits, calling code 1–9) plus a
 * light cross-check against the CRM {@link PHONE_PATTERN}. Confidence is
 * heuristic, not certainty.
 *
 * @returns {{ e164: string|null, national: string|null, valid: boolean }}
 */
export function normalizePhone(raw, region = 'CH') {
  const fail = { e164: null, national: null, valid: false };
  if (typeof raw !== 'string') return { ...fail };
  const trimmed = raw.trim();
  if (!trimmed) return { ...fail };

  const cc = COUNTRY_CODES[region] || COUNTRY_CODES.CH;
  const hasLetters = /[A-Za-z]/.test(trimmed);
  // Keep digits and a leading '+'; drop spaces, dots, dashes, parentheses, etc.
  const cleaned = trimmed.replace(/[^\d+]/g, '');

  let e164 = null;
  if (cleaned.startsWith('+')) {
    e164 = `+${cleaned.slice(1).replace(/\D/g, '')}`;
  } else if (cleaned.startsWith('00')) {
    e164 = `+${cleaned.slice(2)}`;
  } else if (cleaned.startsWith('0')) {
    e164 = `+${cc.code}${cleaned.slice(1)}`;
  } else if (cleaned.startsWith(cc.code)) {
    e164 = `+${cleaned}`;
  } else if (cleaned) {
    // No '+', no trunk '0', not obviously prefixed: assume a national significant
    // number missing its country code for the configured region.
    e164 = `+${cc.code}${cleaned}`;
  }

  const e164Ok = e164 !== null && /^\+[1-9]\d{7,14}$/.test(e164);
  if (!e164Ok) return { ...fail };

  const looksPhone = PHONE_PATTERN.test(trimmed);
  const valid = e164Ok && looksPhone && !hasLetters;

  // National form: confident only when the number belongs to the region's
  // calling code (prepend the trunk prefix). Otherwise leave null rather than
  // guess the foreign country code length.
  let national = null;
  if (e164.startsWith(`+${cc.code}`)) {
    national = `${cc.trunk}${e164.slice(1 + cc.code.length)}`;
  }

  return { e164, national, valid };
}

/**
 * Reduce a URL to a registrable-ish domain for comparison: strip scheme, `www.`,
 * path, query, fragment and port; lowercase. Not a full public-suffix parse —
 * other subdomains are preserved (documented limitation). Returns `null` when no
 * plausible host can be extracted. The original URL must be kept for display.
 */
export function normalizeWebsiteDomain(url) {
  if (typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;

  let candidate = raw.toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `http://${candidate}`;
  }

  let host = null;
  try {
    host = new URL(candidate).hostname;
  } catch {
    host = null;
  }
  if (!host) {
    // Manual fallback if URL parsing failed.
    host = raw
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '');
  }
  if (!host) return null;
  host = host.replace(/^www\./, '');

  // Must look like a hostname with a TLD.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return host;
}

/**
 * Canonical Google Maps place URL (design §6). Prefers the `lat,lng` query with
 * `query_place_id` (Google's supported deep-link format). Falls back to the
 * place id as the query text when coordinates are missing. Returns `null` when
 * neither coordinates nor a place id are available.
 */
export function buildMapsUrl({ lat, lng, placeId } = {}) {
  const hasCoords =
    typeof lat === 'number' && Number.isFinite(lat) &&
    typeof lng === 'number' && Number.isFinite(lng);
  if (!hasCoords && !placeId) return null;

  const query = hasCoords ? `${lat},${lng}` : encodeURIComponent(String(placeId));
  let out = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (placeId) out += `&query_place_id=${encodeURIComponent(String(placeId))}`;
  return out;
}

/** Parse Google Places (New) `addressComponents` into the address sub-doc. */
function parseGoogleAddress(components, formatted) {
  const out = {
    formatted: formatted || null,
    street: null,
    area: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    canton: null,
  };
  if (!Array.isArray(components)) return out;

  let route = null;
  let streetNumber = null;
  let regionCode = null;
  let districtFallback = null;
  for (const comp of components) {
    const types = Array.isArray(comp?.types) ? comp.types : [];
    const longText = comp?.longText ?? comp?.long_name ?? null;
    const shortText = comp?.shortText ?? comp?.short_name ?? null;
    if (types.includes('route')) route = longText;
    else if (types.includes('street_number')) streetNumber = longText;
    else if (types.includes('locality') || types.includes('postal_town')) out.city = longText;
    else if (types.includes('neighborhood')
      || types.includes('sublocality_level_1')
      || types.includes('sublocality_level_2')
      || types.includes('sublocality')) out.area = out.area || longText;
    else if (types.includes('administrative_area_level_2')) districtFallback = longText;
    else if (types.includes('administrative_area_level_1')) {
      out.region = longText;
      regionCode = shortText;
    } else if (types.includes('postal_code')) out.postalCode = longText;
    else if (types.includes('country')) out.country = shortText || longText;
  }
  // Swiss street convention: name then number ("Bahnhofstrasse 12").
  const street = [route, streetNumber].filter(Boolean).join(' ').trim();
  out.street = street || null;
  out.area = out.area || districtFallback || null;
  // Canton: the admin-area short code when it is a recognised Swiss canton.
  out.canton = regionCode && SWISS_CANTONS.includes(regionCode) ? regionCode : null;
  return out;
}

/** Use an already-structured address object (generic input), defensively. */
function parseGenericAddress(address) {
  if (!address || typeof address !== 'object') {
    return { formatted: null, street: null, area: null, city: null, region: null, postalCode: null, country: null, canton: null };
  }
  const regionCode = address.canton ?? address.regionCode ?? null;
  return {
    formatted: pick(address.formatted, address.formattedAddress) ?? null,
    street: pick(address.street) ?? null,
    area: pick(address.area, address.neighborhood, address.neighbourhood, address.suburb, address.district, address.borough) ?? null,
    city: pick(address.city) ?? null,
    region: pick(address.region, address.state) ?? null,
    postalCode: pick(address.postalCode, address.postal_code, address.zip) ?? null,
    country: pick(address.country, address.countryCode) ?? null,
    canton: regionCode && SWISS_CANTONS.includes(regionCode) ? regionCode : (address.canton ?? null),
  };
}

/**
 * Normalize provider photo references to `[{ url, source, attribution }]`.
 * Accepts either already-shaped objects (OSM provider) or bare URL strings.
 * Only http(s) URLs are kept; never fabricated — an empty/invalid input yields
 * an empty array.
 */
function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  const out = [];
  const seen = new Set();
  for (const photo of photos) {
    const url = typeof photo === 'string' ? photo : photo?.url;
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!/^https?:\/\/\S+$/i.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push({
      url: trimmed,
      source: (typeof photo === 'object' && photo?.source) ? String(photo.source).slice(0, 60) : null,
      attribution: (typeof photo === 'object' && photo?.attribution) ? String(photo.attribution).slice(0, 255) : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** Extract `[lng, lat]` coordinates from the many location shapes we may see. */
function extractCoordinates(raw) {
  const loc = raw?.location;
  if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return [loc.longitude, loc.latitude]; // Google Places (New)
  }
  if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    const [lng, lat] = loc.coordinates; // already GeoJSON [lng, lat]
    if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat];
  }
  if (loc && typeof loc.lng === 'number' && typeof loc.lat === 'number') {
    return [loc.lng, loc.lat];
  }
  if (typeof raw?.lat === 'number' && typeof raw?.lng === 'number') {
    return [raw.lng, raw.lat];
  }
  return null;
}

/**
 * Map a Google Place (Places API New shape) OR a generic business object to the
 * `discovery_results.business` sub-doc (design §4.2). Defensive about missing
 * fields; NEVER fabricates phone/email/website (design §63). `email` is only set
 * when the input actually supplies it (Google Places does not return email).
 *
 * @param {object} raw
 * @returns {object} the `business` sub-document
 */
export function normalizeBusiness(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      name: null,
      normalizedName: null,
      primaryType: null,
      types: [],
      phone: null,
      internationalPhone: null,
      normalizedPhone: null,
      website: null,
      websiteDomain: null,
      email: null,
      address: { formatted: null, street: null, area: null, city: null, region: null, postalCode: null, country: null, canton: null },
      location: null,
      rating: null,
      reviewCount: null,
      priceLevel: null,
      businessStatus: null,
      openingHours: null,
      photos: [],
      mapsUrl: null,
    };
  }

  const name =
    pick(
      raw.displayName?.text,
      typeof raw.displayName === 'string' ? raw.displayName : undefined,
      raw.name,
    ) ?? null;

  const address = Array.isArray(raw.addressComponents)
    ? parseGoogleAddress(raw.addressComponents, pick(raw.formattedAddress, raw.address?.formatted))
    : parseGenericAddress(raw.address ?? { formatted: raw.formattedAddress });
  const phone = pick(raw.nationalPhoneNumber, raw.phone) ?? null;
  const internationalPhone = pick(raw.internationalPhoneNumber, raw.internationalPhone) ?? null;
  const phoneSource = internationalPhone || phone;
  const normalizedPhone = phoneSource ? normalizePhone(phoneSource, address.country || 'CH').e164 : null;

  const website = pick(raw.websiteUri, raw.website) ?? null;

  const coordinates = extractCoordinates(raw);
  const placeId = pick(raw.id, raw.placeId, raw.provider?.placeId) ?? null;

  const isOsm = raw.source === 'OPENSTREETMAP'
    || raw.providerName === 'openstreetmap'
    || raw.provider?.name === 'openstreetmap'
    || String(placeId || '').startsWith('osm:');
  const mapsUrl = isOsm
    ? pick(raw.mapsUrl, raw.googleMapsUri) ?? null
    : (
        coordinates || placeId
          ? buildMapsUrl({
              lat: coordinates ? coordinates[1] : undefined,
              lng: coordinates ? coordinates[0] : undefined,
              placeId: placeId ?? undefined,
            })
          : pick(raw.googleMapsUri, raw.mapsUrl) ?? null
      );

  return {
    providerName: raw.providerName || raw.provider?.name || null,
    source: raw.source || null,
    provider: raw.provider || null,
    osmType: raw.osmType || null,
    osmId: raw.osmId || null,
    osmTags: raw.osmTags || null,
    name,
    normalizedName: name ? normalizeName(name) : null,
    primaryType: pick(raw.primaryType) ?? null,
    types: Array.isArray(raw.types) ? raw.types : [],
    phone,
    internationalPhone,
    normalizedPhone,
    website,
    websiteDomain: normalizeWebsiteDomain(website),
    email: pick(raw.email) ?? null, // never fabricated; Google does not supply it
    address,
    location: coordinates ? { type: 'Point', coordinates } : null,
    rating: numberOrNull(raw.rating),
    reviewCount: numberOrNull(pick(raw.userRatingCount, raw.reviewCount)),
    priceLevel: pick(raw.priceLevel) ?? null,
    businessStatus: pick(raw.businessStatus) ?? null,
    openingHours: pick(raw.regularOpeningHours, raw.currentOpeningHours, raw.openingHours) ?? null,
    photos: normalizePhotos(raw.photos),
    mapsUrl,
  };
}

export default {
  normalizeName,
  normalizePhone,
  normalizeWebsiteDomain,
  normalizeBusiness,
  buildMapsUrl,
};
