/**
 * Google Places API (New) field masks for Business Discovery (Module 15).
 *
 * Field masks are the primary cost control (design §6, §14): Places (New) bills
 * by the most expensive field category requested. The adaptive discovery sweep
 * deliberately uses DETAILS_IMPORT so phone, website and structured address are
 * available for display and strong deduplication; low-cost callers may still use
 * DISCOVERY_MINIMAL explicitly.
 *
 * Paths use the `places.` prefix required by the search endpoints
 * (`places:searchNearby`, `places:searchText`). NOTE: the Place Details endpoint
 * (`places/{id}`) expects the SAME field names WITHOUT the `places.` prefix — the
 * provider adapter strips it when calling details. Keeping one prefixed source of
 * truth here avoids drift.
 *
 * Billing tiers (approximate, for reviewers):
 *  - Pro:        id, displayName, formattedAddress, location, primaryType, types,
 *                businessStatus
 *  - Enterprise: nationalPhoneNumber, internationalPhoneNumber, websiteUri,
 *                regularOpeningHours, priceLevel, addressComponents
 *  - Atmosphere: rating, userRatingCount
 */

// Minimal profile retained for low-cost callers. Business discovery currently
// uses DETAILS_IMPORT so phone/domain/address deduplication is accurate immediately.
const DISCOVERY_MINIMAL = Object.freeze([
  'places.id',
  'places.displayName',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.formattedAddress',
  'places.businessStatus',
  'places.rating',
  'places.userRatingCount',
]);

// Detail-drawer open: minimal + contact + hours + price. Fetched on demand.
const DETAILS_STANDARD = Object.freeze([
  ...DISCOVERY_MINIMAL,
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.priceLevel',
]);

// Import: standard + structured address components for clean Lead field mapping.
const DETAILS_IMPORT = Object.freeze([
  ...DETAILS_STANDARD,
  'places.addressComponents',
]);

/**
 * Named field profiles. Frozen so downstream code cannot mutate the shared
 * arrays.
 */
export const FIELD_PROFILES = Object.freeze({
  DISCOVERY_MINIMAL,
  DETAILS_STANDARD,
  DETAILS_IMPORT,
});

/**
 * Build the comma-joined value for the `X-Goog-FieldMask` header.
 *
 * @param {string|string[]} profile - a profile name (`'DISCOVERY_MINIMAL'`, …)
 *   or an explicit array of field paths.
 * @returns {string}
 * @throws {Error} with `.code === 'INVALID_FIELD_PROFILE'` for an unknown name or
 *   a non-array/empty profile.
 */
export function fieldMask(profile) {
  let paths = null;
  if (typeof profile === 'string') {
    paths = FIELD_PROFILES[profile] || null;
  } else if (Array.isArray(profile)) {
    paths = profile;
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    const err = new Error(`Unknown or empty field profile: ${String(profile)}`);
    err.code = 'INVALID_FIELD_PROFILE';
    throw err;
  }
  return paths.join(',');
}

export default FIELD_PROFILES;
