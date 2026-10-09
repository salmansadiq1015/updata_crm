import mongoose from 'mongoose';
import { resolveLeadAddress, sanitizeCity } from '../modules/crm/leadLocation.js';
import logger from '../shared/logger/index.js';

/**
 * Backfill a missing lead city / country from the SELECTED SEARCH LOCATION the
 * lead was discovered under — the last-resort fallback added alongside this
 * migration. Earlier migrations (009 / 011) recover city/country by
 * reverse-geocoding a lead's own coordinates; this one covers the leads that
 * geocoding could not (geocoder off, or no coordinates at all) but that DO carry
 * a search-location hint:
 *   - `sourceMetadata.searchLocation` (string, e.g. "Lahore, Pakistan"), or
 *   - `sourceMetadata.discoveryLocation` ({ name, city, countryCode, country,
 *     formattedAddress }) stored on discovery-imported leads.
 *
 * Strictly gap-filling + idempotent:
 *   - Only a city that is missing/invalid (postal code / junk) is filled.
 *   - Only a missing country is filled.
 *   - A field that already holds a valid value is NEVER overwritten.
 *   - Coordinates, when present, still take precedence (resolveLeadAddress uses
 *     them first); the search location only fills what remains.
 *   - A lead with no usable hint is left untouched (nothing is invented).
 *
 * No reverse-geocoder is required: the search-location fallback works offline.
 */

export async function up() {
  const leads = mongoose.connection.db.collection('leads');
  // Only leads that could actually be improved AND carry a hint to improve with.
  const cursor = leads.find(
    {
      $and: [
        { $or: [{ 'address.city': { $in: [null, ''] } }, { 'address.country': { $in: [null, ''] } }] },
        {
          $or: [
            { 'sourceMetadata.searchLocation': { $type: 'string', $ne: '' } },
            { 'sourceMetadata.discoveryLocation': { $type: 'object' } },
          ],
        },
      ],
    },
    { projection: { _id: 1, address: 1, location: 1, sourceMetadata: 1 } },
  );

  let scanned = 0;
  let updated = 0;
  for await (const lead of cursor) {
    scanned += 1;
    const addr = lead.address || {};
    const cityMissing = !sanitizeCity(addr.city);
    const countryMissing = !addr.country;
    if (!cityMissing && !countryMissing) continue;

    const meta = lead.sourceMetadata || {};
    const loc = meta.discoveryLocation && typeof meta.discoveryLocation === 'object' ? meta.discoveryLocation : {};
    const coords = lead.location?.coordinates;
    const [lng, lat] = Array.isArray(coords) && coords.length >= 2 ? coords.map(Number) : [undefined, undefined];

    const resolved = await resolveLeadAddress({
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      canton: addr.canton,
      region: addr.region,
      latitude: lat,
      longitude: lng,
      fallbackCity: loc.city,
      fallbackCountry: loc.countryCode || loc.country,
      fallbackLocation: meta.searchLocation || loc.formattedAddress || loc.name,
    });

    const set = {};
    if (cityMissing && resolved.city) set['address.city'] = resolved.city;
    if (countryMissing && resolved.country) set['address.country'] = resolved.country;
    // Keep region consistent with the resolved country (CH has none; a non-Swiss
    // lead backfills region only when it was empty).
    if (resolved.country === 'CH') {
      if (addr.region) set['address.region'] = null;
    } else if (resolved.country && !addr.region && resolved.region) {
      set['address.region'] = resolved.region;
    }

    if (Object.keys(set).length > 0) {
      await leads.updateOne({ _id: lead._id }, { $set: set });
      updated += 1;
    }
  }

  logger.info(`013 backfill-lead-location-fallback: scanned ${scanned} lead(s), updated ${updated}`, { module: 'migration' });
}

// Non-destructive data backfill (fills only empty city/country) — nothing to roll back.
export async function down() {}
