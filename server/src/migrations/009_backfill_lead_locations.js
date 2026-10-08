import mongoose from 'mongoose';
import { resolveLeadAddress, sanitizeCity } from '../modules/crm/leadLocation.js';
import { nominatimProvider } from '../modules/businessDiscovery/provider/NominatimProvider.js';
import logger from '../shared/logger/index.js';

/**
 * Backfill proper city/country on leads created before coordinate-aware address
 * resolution. Earlier imports stored a bare postal code as the city, junk such
 * as "PRESS CONFERENCE", or wrongly defaulted the country to CH (Switzerland)
 * for non-Swiss leads. This re-resolves those from the lead's own coordinates.
 *
 * Best-effort + idempotent: leads that already look correct are skipped, and
 * re-running continues where a previous run left off (reverse-geocoding is
 * rate-limited, so a very large backfill may take several runs).
 */

const inSwitzerland = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= 45.8 && lat <= 47.9 && lng >= 5.9 && lng <= 10.6;

export async function up() {
  if (typeof nominatimProvider.isConfigured === 'function' && !nominatimProvider.isConfigured()) {
    logger.warn('009 backfill-lead-locations: geocoder not configured — skipping', { module: 'migration' });
    return;
  }

  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find(
    { 'location.coordinates': { $type: 'array' } },
    { projection: { _id: 1, address: 1, location: 1 } },
  );

  let scanned = 0;
  let updated = 0;
  for await (const lead of cursor) {
    scanned += 1;
    const coords = lead.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lng, lat] = coords.map(Number);
    const addr = lead.address || {};

    const cityBad = !sanitizeCity(addr.city);
    const countryBad = !addr.country || (addr.country === 'CH' && !inSwitzerland(lat, lng));
    if (!cityBad && !countryBad) continue;

    const resolved = await resolveLeadAddress({
      street: addr.street, city: addr.city, postalCode: addr.postalCode,
      canton: addr.canton, country: addr.country, latitude: lat, longitude: lng,
    });

    const set = {};
    if (cityBad && resolved.city) set['address.city'] = resolved.city;
    if (countryBad && resolved.country) set['address.country'] = resolved.country;
    if ((resolved.canton ?? null) !== (addr.canton ?? null)) set['address.canton'] = resolved.canton;
    if (!addr.postalCode && resolved.postalCode) set['address.postalCode'] = resolved.postalCode;

    if (Object.keys(set).length > 0) {
      await leads.updateOne({ _id: lead._id }, { $set: set });
      updated += 1;
    }
  }

  logger.info(`009 backfill-lead-locations: scanned ${scanned} lead(s), updated ${updated}`, { module: 'migration' });
}

// Non-destructive data backfill — nothing to roll back.
export async function down() {}
