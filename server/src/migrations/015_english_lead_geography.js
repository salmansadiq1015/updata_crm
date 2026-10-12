import mongoose from 'mongoose';
import { nominatimProvider } from '../modules/businessDiscovery/provider/NominatimProvider.js';
import { addressFromNominatim } from '../modules/crm/leadLocation.js';
import {
  canonicalizeLeadAddress,
  needsGeoRepair,
  normalizeCountryCode,
} from '../modules/crm/leadGeography.js';
import logger from '../shared/logger/index.js';

/**
 * 015 — one English, de-duplicated geography per lead.
 *
 * 014 canonicalized the stored strings but could not fix names that are wrong
 * at the source: cities written only in Urdu/Arabic ("لاہور", "کھمبے"), Lahore
 * suburbs stored as their own "city", and scraper fragments stored as the city
 * ("A Rosewood Hotel · Visited link", "Immeuble Haj Yemmou"). For those leads
 * (and any lead missing a city or country) this re-derives city/area/country
 * from the lead's OWN coordinates via Nominatim in English. Every lead is then
 * re-canonicalized (bilingual labels keep their Latin name), and leads that
 * share one canonical city/area get one consistent spelling.
 *
 * Safe: the full pre-migration address is backed up per lead ($setOnInsert, so
 * a resumed run keeps the original); down() restores it exactly. Leads without
 * coordinates are only re-canonicalized — never given an invented place.
 */

const BACKUP_COLLECTION = 'migration_015_lead_geography_english_backup';
const BATCH_SIZE = 500;
const NOMINATIM_INTERVAL_MS = 1100;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function coordinatesOf(lead) {
  const c = lead?.location?.coordinates;
  return Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lat: c[1], lng: c[0] } : null;
}

/** A stored address that must be re-derived from the lead's coordinates. */
export function needsRepair(address = {}) {
  return !address?.city
    || !normalizeCountryCode(address?.country)
    || needsGeoRepair(address.city)
    || (Boolean(address?.area) && needsGeoRepair(address.area));
}

// What a lead actually shows and filters by. Re-running the canonicalizer can
// shuffle bookkeeping (source, review flags) without changing any of this, and
// such a lead must not be rewritten.
function materialKey(address) {
  if (!address) return 'null';
  const g = address.geography ?? {};
  return JSON.stringify([
    address.country ?? null, address.city ?? null, address.area ?? null, address.region ?? null,
    g.countryId ?? null, g.cityId ?? null, g.areaId ?? null, g.cityName ?? null, g.areaName ?? null,
  ]);
}

const isChanged = (before, after) => !before?.geography || materialKey(before) !== materialKey(after);

/** Pure: the repaired, canonical address for one lead given its geocode. */
export function planRepair(lead, geo = null) {
  const before = lead?.address ?? null;
  const next = { ...(before ?? {}) };
  if (geo) {
    // Repair was triggered and the lead's own exact coordinates resolved a
    // city: that is authoritative ("Lot Massira" + "Etage 2" → Mohammédia).
    const replaceCity = Boolean(geo.city);
    if (replaceCity) next.city = geo.city;
    if (!normalizeCountryCode(next.country) && geo.country) next.country = geo.country;
    if (replaceCity || !next.area || needsGeoRepair(next.area)) {
      next.area = geo.area ?? (next.area && needsGeoRepair(next.area) ? null : next.area);
    }
    if (!next.region && geo.region) next.region = geo.region;
  }
  const after = canonicalizeLeadAddress(next, { source: 'migration_015' });
  return { before, after, changed: isChanged(before, after), geocoded: Boolean(geo) };
}

function createGeocoder({ reverseGeocode, waitMs } = {}) {
  const cache = new Map();
  const call = reverseGeocode ?? (async ({ lat, lng }) => addressFromNominatim((await nominatimProvider.reverseGeocode({ lat, lng })).result));
  const interval = reverseGeocode ? 0 : (waitMs ?? NOMINATIM_INTERVAL_MS);
  let last = 0;
  return async (point) => {
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (cache.has(key)) return cache.get(key);
    let result = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wait = interval - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      last = Date.now();
      try {
        result = await call(point);
        break;
      } catch (error) {
        if (attempt === 2) {
          logger.warn('015 reverse geocode failed; lead left unrepaired', { module: 'migration', error: { message: error.message } });
        } else await sleep(1000 * (attempt + 1));
      }
    }
    cache.set(key, result);
    return result;
  };
}

// Leads sharing a canonical city/area get the label most of them already use,
// so the table spells "Mohammédia" one way everywhere.
function unifyLabels(plans) {
  for (const [idField, nameField, addressField] of [['cityId', 'cityName', 'city'], ['areaId', 'areaName', 'area']]) {
    const votes = new Map();
    for (const plan of plans) {
      const id = plan.after.geography?.[idField];
      const name = plan.after.geography?.[nameField];
      if (!id || !name) continue;
      if (!votes.has(id)) votes.set(id, new Map());
      votes.get(id).set(name, (votes.get(id).get(name) ?? 0) + 1);
    }
    const winner = new Map([...votes].map(([id, names]) => [
      id, [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    ]));
    for (const plan of plans) {
      const id = plan.after.geography?.[idField];
      const label = id ? winner.get(id) : null;
      if (!label || plan.after[addressField] === label) continue;
      plan.after = { ...plan.after, [addressField]: label, geography: { ...plan.after.geography, [nameField]: label } };
      plan.changed = isChanged(plan.before, plan.after);
    }
  }
}

/**
 * Compute every lead's plan. Geocodes only leads that need repair and have
 * coordinates. `dryRun` (preview) writes nothing.
 */
export async function run({
  db = mongoose.connection.db, reverseGeocode, waitMs, dryRun = false, sampleSize = 25,
} = {}) {
  const leads = db.collection('leads');
  const geocode = createGeocoder({ reverseGeocode, waitMs });
  const plans = [];
  const stats = { scanned: 0, needingRepair: 0, geocoded: 0, unrepairable: 0, changed: 0, updated: 0, samples: [] };

  const cursor = leads.find({}, { projection: { _id: 1, address: 1, location: 1, isDeleted: 1 } });
  for await (const lead of cursor) {
    stats.scanned += 1;
    let geo = null;
    // Soft-deleted leads never appear in filters: canonicalize them, but spend
    // no rate-limited geocoding on them.
    if (lead.isDeleted !== true && needsRepair(lead.address)) {
      stats.needingRepair += 1;
      const point = coordinatesOf(lead);
      geo = point ? await geocode(point) : null;
      if (geo) stats.geocoded += 1; else stats.unrepairable += 1;
    }
    plans.push({ leadId: lead._id, ...planRepair(lead, geo) });
  }
  unifyLabels(plans);

  const changed = plans.filter((plan) => plan.changed);
  stats.changed = changed.length;
  stats.samples = changed.slice(0, sampleSize).map((plan) => ({
    leadId: String(plan.leadId),
    before: { country: plan.before?.country ?? null, city: plan.before?.city ?? null, area: plan.before?.area ?? null },
    after: { country: plan.after.country, city: plan.after.city, area: plan.after.area },
  }));
  if (dryRun) return stats;

  const backups = db.collection(BACKUP_COLLECTION);
  await backups.createIndex({ leadId: 1 }, { unique: true, name: 'leadId_unique' });
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const batch = changed.slice(i, i + BATCH_SIZE);
    // Rollback material is persisted before the lead is touched.
    await backups.bulkWrite(batch.map((plan) => ({
      updateOne: {
        filter: { leadId: plan.leadId },
        update: {
          $setOnInsert: {
            leadId: plan.leadId, hadAddress: plan.before !== null, address: plan.before, backedUpAt: new Date(),
          },
        },
        upsert: true,
      },
    })), { ordered: true });
    const result = await leads.bulkWrite(batch.map((plan) => ({
      updateOne: { filter: { _id: plan.leadId }, update: { $set: { address: plan.after } } },
    })), { ordered: false });
    stats.updated += result.modifiedCount ?? 0;
  }
  return stats;
}

export async function preview(options = {}) {
  return run({ ...options, dryRun: true });
}

export async function up(options = {}) {
  const stats = await run(options);
  logger.info('015 English lead geography applied', { module: 'migration', ...stats, samples: undefined });
  return stats;
}

export async function down({ db = mongoose.connection.db } = {}) {
  const leads = db.collection('leads');
  const backups = db.collection(BACKUP_COLLECTION);
  let restored = 0;
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    await leads.bulkWrite(ops, { ordered: false });
    ops = [];
  };
  for await (const backup of backups.find({})) {
    ops.push({
      updateOne: {
        filter: { _id: backup.leadId },
        update: backup.hadAddress ? { $set: { address: backup.address } } : { $unset: { address: '' } },
      },
    });
    restored += 1;
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();
  await backups.drop().catch((error) => {
    if (error?.codeName !== 'NamespaceNotFound') throw error;
  });
  logger.info('015 English lead geography rolled back', { module: 'migration', restored });
  return { restored };
}
