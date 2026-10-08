import mongoose from 'mongoose';
import { resolveFromCoordinates } from '../modules/crm/leadLocation.js';
import { normalizeBusinessType } from '../modules/crm/businessTypeLabel.js';
import { nominatimProvider } from '../modules/businessDiscovery/provider/NominatimProvider.js';
import logger from '../shared/logger/index.js';

/**
 * Backfill richer business data on leads created before this release:
 *  1. Re-normalize `sourceMetadata.businessType` into a clean label
 *     ("Hotel", "Restaurant") — old discovery leads stored joined catalog ids
 *     ("hotel,restaurant"); extension leads stored raw/fragile categories.
 *  2. Fill `address.area` / `address.region` from the lead's own coordinates
 *     (reverse-geocode) when they are missing.
 *  3. For discovery leads, recover `providerMeta.{photos,openingHours,
 *     businessStatus,mapsUrl}` and `address.{formatted,region}` from the linked
 *     DiscoveryResult, which retained them even though the old import dropped them.
 *
 * Best-effort + idempotent: only missing/improvable fields are set, and the geo
 * step is skipped (the rest still runs) when no reverse-geocoder is configured.
 * Never fabricates ratings/distributions.
 */

export async function up() {
  const geocoderOn = !(typeof nominatimProvider.isConfigured === 'function') || nominatimProvider.isConfigured();
  if (!geocoderOn) {
    logger.warn('010 backfill-lead-business-data: geocoder off — area/region step skipped', { module: 'migration' });
  }

  const leads = mongoose.connection.db.collection('leads');
  const results = mongoose.connection.db.collection('discovery_results');
  const cursor = leads.find(
    {},
    { projection: { _id: 1, address: 1, location: 1, providerMeta: 1, sourceMetadata: 1 } },
  );

  let scanned = 0;
  let updated = 0;
  for await (const lead of cursor) {
    scanned += 1;
    const addr = lead.address || {};
    const meta = lead.sourceMetadata || {};
    const pm = lead.providerMeta || {};
    const set = {};

    // 3. Recover dropped fields from the linked discovery result.
    let business = null;
    if (meta.discoveryResultId) {
      const result = await results.findOne(
        { _id: meta.discoveryResultId },
        { projection: { business: 1 } },
      ).catch(() => null);
      business = result?.business || null;
    }
    if (business) {
      if ((!Array.isArray(pm.photos) || pm.photos.length === 0) && Array.isArray(business.photos) && business.photos.length) {
        set['providerMeta.photos'] = business.photos;
      }
      if (pm.openingHours == null && business.openingHours != null) set['providerMeta.openingHours'] = business.openingHours;
      if (!pm.businessStatus && business.businessStatus) set['providerMeta.businessStatus'] = business.businessStatus;
      if (!pm.mapsUrl && business.mapsUrl) set['providerMeta.mapsUrl'] = business.mapsUrl;
      if (!addr.formatted && business.address?.formatted) set['address.formatted'] = business.address.formatted;
      if (!addr.region && addr.country && addr.country !== 'CH' && business.address?.region) {
        set['address.region'] = business.address.region;
      }
    }

    // 1. Re-normalize the business type (prefer the discovery primaryType).
    const normalizedType = normalizeBusinessType(business?.primaryType) ?? normalizeBusinessType(meta.businessType);
    if (normalizedType && normalizedType !== meta.businessType) {
      set['sourceMetadata.businessType'] = normalizedType;
    }

    // 2. Fill area / region from coordinates.
    const coords = lead.location?.coordinates;
    if (geocoderOn && (!addr.area || (!addr.region && addr.country && addr.country !== 'CH'))
      && Array.isArray(coords) && coords.length >= 2) {
      const [lng, lat] = coords.map(Number);
      const geo = await resolveFromCoordinates(lat, lng);
      if (geo) {
        if (!addr.area && geo.area) set['address.area'] = geo.area;
        if (!addr.region && addr.country && addr.country !== 'CH' && geo.region) set['address.region'] = geo.region;
      }
    }

    if (Object.keys(set).length > 0) {
      await leads.updateOne({ _id: lead._id }, { $set: set });
      updated += 1;
    }
  }

  logger.info(`010 backfill-lead-business-data: scanned ${scanned} lead(s), updated ${updated}`, { module: 'migration' });
}

// Non-destructive data backfill — nothing to roll back.
export async function down() {}
