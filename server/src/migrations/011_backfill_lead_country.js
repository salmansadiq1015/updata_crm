import mongoose from 'mongoose';
import { normalizeCountryCode, resolveFromCoordinates } from '../modules/crm/leadLocation.js';
import { nominatimProvider } from '../modules/businessDiscovery/provider/NominatimProvider.js';
import logger from '../shared/logger/index.js';

/**
 * Re-clean `address.country` on leads created before the address-resolution fix
 * (commit "Resolve real lead city/country from coordinates"). Old extension
 * imports stored whatever the Maps scrape put in the last address segment —
 * including junk like "PRESS CONFERENCE" — straight into `address.country`, and
 * full country names ("Pakistan") that were never reduced to an ISO code.
 *
 * For each lead whose stored country is NOT already a clean code:
 *   - "Pakistan"/"pk" → "PK" (normalizeCountryCode).
 *   - junk ("PRESS CONFERENCE", …) → drop it, then recover the real country by
 *     reverse-geocoding the lead's own coordinates (the reliable signal).
 *   - region is kept consistent (CH has none; a non-Swiss lead backfills region
 *     from the same geocode when it was empty).
 *
 * Best-effort + idempotent: only leads with a non-clean country are touched, and
 * the geocode step is skipped (country simply set to null) when no reverse
 * geocoder is configured. Never guesses a country from anything but coordinates.
 */

export async function up() {
  const geocoderOn = !(typeof nominatimProvider.isConfigured === 'function') || nominatimProvider.isConfigured();
  if (!geocoderOn) {
    logger.warn('011 backfill-lead-country: geocoder off — junk countries will be cleared, not re-resolved', { module: 'migration' });
  }

  const leads = mongoose.connection.db.collection('leads');
  const cursor = leads.find(
    {},
    { projection: { _id: 1, address: 1, location: 1 } },
  );

  let scanned = 0;
  let updated = 0;
  for await (const lead of cursor) {
    scanned += 1;
    const addr = lead.address || {};
    const raw = typeof addr.country === 'string' ? addr.country.trim() : '';
    if (!raw) continue; // nothing stored — leave as-is

    const normalized = normalizeCountryCode(raw); // "Pakistan"→PK, junk→null, "PK"→PK
    if (normalized === raw) continue; // already a clean ISO code (e.g. "CH", "PK")

    let country = normalized;
    let geo = null;
    const coords = lead.location?.coordinates;
    if (!country && geocoderOn && Array.isArray(coords) && coords.length >= 2) {
      const [lng, lat] = coords.map(Number);
      geo = await resolveFromCoordinates(lat, lng);
      country = geo?.country ?? null;
    }

    const set = { 'address.country': country };
    if (country === 'CH') {
      // Switzerland's sub-national admin is the canton, never `region`.
      if (addr.region) set['address.region'] = null;
    } else if (country && !addr.region && geo?.region) {
      set['address.region'] = geo.region;
    }

    await leads.updateOne({ _id: lead._id }, { $set: set });
    updated += 1;
  }

  logger.info(`011 backfill-lead-country: scanned ${scanned} lead(s), updated ${updated}`, { module: 'migration' });
}

// Non-destructive data backfill (junk → real/null country) — nothing to roll back.
export async function down() {}
