import Vehicle from '../modules/vehicles/vehicle.model.js';
import VehicleServiceEntry from '../modules/vehicles/vehicleServiceEntry.model.js';
import VehicleCostEntry from '../modules/vehicles/vehicleCostEntry.model.js';
import VehicleBooking from '../modules/vehicles/vehicleBooking.model.js';
import { plateKeyOf } from '../modules/vehicles/vehicle.constants.js';
import logger from '../shared/logger/index.js';

/**
 * Fleet management upgrade.
 *
 * Additive: new collections (costs, bookings) and their indexes, the
 * normalised `plateKey` on every existing vehicle (deleted ones included, so
 * a restore stays consistent) and the new list indexes. Existing fields are
 * not rewritten; absent new fields read as their schema defaults.
 * Duplicate plates already in the data are reported, never merged.
 */
export const name = '051_fleet_management';

export async function up() {
  const vehicles = await Vehicle.find({}, { kennzeichen: 1, plateKey: 1 }, { includeDeleted: true }).lean();
  const ops = vehicles
    .filter((v) => v.plateKey !== plateKeyOf(v.kennzeichen))
    .map((v) => ({ updateOne: { filter: { _id: v._id }, update: { $set: { plateKey: plateKeyOf(v.kennzeichen) } } } }));
  if (ops.length) await Vehicle.collection.bulkWrite(ops, { ordered: false });

  const seen = new Map();
  for (const v of vehicles) {
    const key = plateKeyOf(v.kennzeichen);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (duplicates.length) logger.warn('Duplicate vehicle plates found — resolve manually', { module: 'migration', duplicates });

  // The old text index is unused since search moved to escaped prefix-free regex + plateKey.
  try {
    const indexes = await Vehicle.collection.indexes();
    const textIndex = indexes.find((i) => Object.values(i.key || {}).includes('text'));
    if (textIndex) await Vehicle.collection.dropIndex(textIndex.name);
  } catch (err) {
    logger.warn('Vehicle text index not dropped', { module: 'migration', error: err.message });
  }

  for (const model of [Vehicle, VehicleServiceEntry, VehicleCostEntry, VehicleBooking]) await model.createIndexes();
  logger.info('Fleet management migration applied', { module: 'migration', plateKeysSet: ops.length });
}

// Indexes and plate keys are harmless without the feature; nothing to undo.
export async function down() {}

export default { name, up, down };
