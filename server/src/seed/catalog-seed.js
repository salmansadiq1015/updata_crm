import UnitOfMeasure, { STANDARD_UNITS } from '../modules/catalog/unitOfMeasure.model.js';
import logger from '../shared/logger/index.js';

/**
 * Seed standard units of measure.
 *
 * Idempotent: uses $setOnInsert so existing documents are never overwritten.
 * Safe to run on every startup.
 */
export async function seedCatalog() {
  try {
    let count = 0;

    for (const unit of STANDARD_UNITS) {
      const result = await UnitOfMeasure.updateOne(
        { code: unit.code },
        { $setOnInsert: unit },
        { upsert: true },
      );
      if (result.upsertedCount > 0) count++;
    }

    logger.info(`Catalog seeded (${count} new units inserted, ${STANDARD_UNITS.length} total standard units)`, {
      module: 'seed',
    });

    return count;
  } catch (err) {
    logger.error('Catalog seeding failed', {
      module: 'seed',
      error: { message: err.message, stack: err.stack },
    });
    throw err;
  }
}

export default seedCatalog;
