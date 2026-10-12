import mongoose from 'mongoose';
import locationService from '../modules/businessDiscovery/location.service.js';
import {
  canonicalizeLeadAddress,
  normalizeCountryCode,
  normalizeGeographyKey,
} from '../modules/crm/leadGeography.js';
import logger from '../shared/logger/index.js';

const BACKUP_COLLECTION = 'migration_014_lead_geography_backup';
const CANONICAL_INDEX = 'lead_canonical_geography_filters';
const BATCH_SIZE = 500;
const NOMINATIM_INTERVAL_MS = 1100;

function comparable(value) {
  return JSON.stringify(value ?? null);
}

export function buildCanonicalGeographyMigrationPlan(lead, geographyOptions = {}) {
  const before = lead?.address ?? null;
  const after = canonicalizeLeadAddress(before ?? {}, {
    source: 'migration_014',
    ...geographyOptions,
  });
  return {
    leadId: lead?._id,
    before,
    after,
    changed: comparable(before) !== comparable(after),
    reviewRequired: after.geography.reviewRequired,
    issues: after.geography.issues,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countryFromDiscoveryContext(lead) {
  const location = lead?.sourceMetadata?.discoveryLocation;
  const direct = normalizeCountryCode(location?.countryCode ?? location?.country);
  if (direct) return direct;

  const name = typeof location?.name === 'string' ? location.name.trim() : '';
  if (!name) return null;
  const pieces = name.split(',').map((part) => part.trim()).filter(Boolean);
  return normalizeCountryCode(pieces.at(-1)) ?? normalizeCountryCode(name);
}

function countryNeedsVerification(lead) {
  // CH was the historical blanket default. Other explicit countries were not
  // created by that defect and must not be second-guessed by this migration.
  return normalizeCountryCode(lead?.address?.country ?? lead?.address?.countryCode) === 'CH';
}

function createResolutionContext({ resolveLocation, waitMs = NOMINATIM_INTERVAL_MS } = {}) {
  return {
    cache: new Map(),
    resolveLocation: resolveLocation ?? ((query) => locationService.resolveLocation(query)),
    waitMs: resolveLocation ? 0 : waitMs,
    lastRequestAt: 0,
  };
}

async function geocodeExactCity(city, context) {
  const candidate = canonicalizeLeadAddress({ city }).city;
  const cityKey = normalizeGeographyKey(candidate);
  if (!cityKey) return null;
  if (context.cache.has(cityKey)) return context.cache.get(cityKey);

  const promise = (async () => {
    const remaining = context.waitMs - (Date.now() - context.lastRequestAt);
    if (remaining > 0) await sleep(remaining);
    context.lastRequestAt = Date.now();

    let resolved;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        resolved = await context.resolveLocation(candidate);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(500 * (2 ** attempt));
      }
    }
    if (lastError) throw lastError;

    const resolvedCode = normalizeCountryCode(resolved?.countryCode ?? resolved?.country);
    const resolvedCityKey = normalizeGeographyKey(resolved?.city);
    // A world geocoder may return a similarly named street or venue. Only an
    // exact normalized locality match is authoritative enough to rewrite data.
    return resolvedCode && resolvedCityKey === cityKey ? resolvedCode : null;
  })();

  context.cache.set(cityKey, promise);
  return promise;
}

export async function resolveCountryVerification(lead, context = createResolutionContext()) {
  if (!countryNeedsVerification(lead)) return {};

  const contextualCode = countryFromDiscoveryContext(lead);
  if (contextualCode) return { verifiedCountryCode: contextualCode, countryVerified: true };

  const city = lead?.address?.city;
  if (!city) return { countryVerified: false };
  const geocodedCode = await geocodeExactCity(city, context);
  return geocodedCode
    ? { verifiedCountryCode: geocodedCode, countryVerified: true }
    : { countryVerified: false };
}

export async function preview({
  db = mongoose.connection.db,
  sampleSize = 20,
  resolveLocation,
  resolutionContext,
} = {}) {
  const leads = db.collection('leads');
  const context = resolutionContext ?? createResolutionContext({ resolveLocation });
  const cursor = leads.find({}, {
    projection: { _id: 1, address: 1, source: 1, sourceMetadata: 1 },
  });
  const stats = { scanned: 0, affected: 0, canonical: 0, reviewRequired: 0, samples: [] };

  for await (const lead of cursor) {
    stats.scanned += 1;
    const verification = await resolveCountryVerification(lead, context);
    const plan = buildCanonicalGeographyMigrationPlan(lead, verification);
    if (!plan.changed) continue;
    stats.affected += 1;
    if (plan.reviewRequired) stats.reviewRequired += 1;
    else stats.canonical += 1;
    if (stats.samples.length < sampleSize) {
      stats.samples.push({
        leadId: String(lead._id),
        before: {
          country: plan.before?.country ?? null,
          city: plan.before?.city ?? null,
          area: plan.before?.area ?? null,
        },
        after: {
          country: plan.after.country,
          city: plan.after.city,
          area: plan.after.area,
          countryId: plan.after.geography.countryId,
          cityId: plan.after.geography.cityId,
          areaId: plan.after.geography.areaId,
          issues: plan.issues,
        },
      });
    }
  }
  return stats;
}

async function flush({ leads, backups, backupOps, leadOps }) {
  if (!leadOps.length) return;
  // Persist rollback material before touching the lead. `$setOnInsert` keeps the
  // first pre-migration snapshot if an interrupted run is safely resumed.
  await backups.bulkWrite(backupOps, { ordered: true });
  await leads.bulkWrite(leadOps, { ordered: false });
  backupOps.length = 0;
  leadOps.length = 0;
}

function sameIndexKeys(left, right) {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value], index) => (
      rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value
    ));
}

async function ensureCanonicalIndex(leads) {
  const keys = {
    isDeleted: 1,
    'address.geography.countryId': 1,
    'address.geography.cityId': 1,
    'address.geography.areaId': 1,
  };
  const existing = await leads.listIndexes().toArray();
  if (existing.some((index) => sameIndexKeys(index.key, keys))) return;
  await leads.createIndex(keys, { name: CANONICAL_INDEX });
}

export async function up({ db = mongoose.connection.db, resolveLocation } = {}) {
  const leads = db.collection('leads');
  const backups = db.collection(BACKUP_COLLECTION);
  await backups.createIndex({ leadId: 1 }, { unique: true, name: 'leadId_unique' });

  const resolutionContext = createResolutionContext({ resolveLocation });
  const previewStats = await preview({ db, resolutionContext });
  logger.info('014 canonical geography preview', { module: 'migration', ...previewStats });

  const cursor = leads.find({}, {
    projection: { _id: 1, address: 1, source: 1, sourceMetadata: 1 },
  });
  const backupOps = [];
  const leadOps = [];
  let updated = 0;

  for await (const lead of cursor) {
    const verification = await resolveCountryVerification(lead, resolutionContext);
    const plan = buildCanonicalGeographyMigrationPlan(lead, verification);
    if (!plan.changed) continue;
    backupOps.push({
      updateOne: {
        filter: { leadId: lead._id },
        update: {
          $setOnInsert: {
            leadId: lead._id,
            hadAddress: Object.prototype.hasOwnProperty.call(lead, 'address'),
            address: plan.before,
            backedUpAt: new Date(),
          },
        },
        upsert: true,
      },
    });
    leadOps.push({
      updateOne: {
        filter: { _id: lead._id },
        update: { $set: { address: plan.after } },
      },
    });
    updated += 1;
    if (leadOps.length >= BATCH_SIZE) await flush({ leads, backups, backupOps, leadOps });
  }
  await flush({ leads, backups, backupOps, leadOps });

  // Mongoose may already have created the same index under an automatic name.
  // Compare key patterns instead of failing the migration on a name mismatch.
  await ensureCanonicalIndex(leads);

  const result = { ...previewStats, updated };
  logger.info('014 canonical geography applied', { module: 'migration', ...result });
  return result;
}

export async function down({ db = mongoose.connection.db } = {}) {
  const leads = db.collection('leads');
  const backups = db.collection(BACKUP_COLLECTION);
  const cursor = backups.find({}, { projection: { leadId: 1, hadAddress: 1, address: 1 } });
  let restored = 0;
  let operations = [];

  const apply = async () => {
    if (!operations.length) return;
    await leads.bulkWrite(operations, { ordered: false });
    operations = [];
  };

  for await (const backup of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: backup.leadId },
        update: backup.hadAddress
          ? { $set: { address: backup.address } }
          : { $unset: { address: '' } },
      },
    });
    restored += 1;
    if (operations.length >= BATCH_SIZE) await apply();
  }
  await apply();

  try {
    await leads.dropIndex(CANONICAL_INDEX);
  } catch (error) {
    if (error?.codeName !== 'IndexNotFound' && error?.code !== 27) throw error;
  }
  await backups.drop();
  logger.info('014 canonical geography rolled back', { module: 'migration', restored });
  return { restored };
}
