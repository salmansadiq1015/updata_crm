import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Scheduled price update job.
 *
 * Finds pending price update batches whose scheduledDate has arrived
 * and applies them. Runs daily at 05:00.
 */
export class ScheduledPriceUpdateWorker extends BaseWorker {
  constructor() {
    super('scheduled-price-update');
  }

  async process(_job) {
    // Lazy imports to avoid circular dependencies
    const PriceUpdateBatch = (await import('../modules/catalog/priceUpdateBatch.model.js')).default;
    const priceService = (await import('../modules/catalog/price.service.js')).default;

    const now = new Date();

    // Find all pending batches whose scheduled date has passed
    const batches = await PriceUpdateBatch.find({
      status: 'PENDING',
      scheduledDate: { $lte: now },
    }).lean();

    let batchesProcessed = 0;

    for (const batch of batches) {
      try {
        logger.info('Processing scheduled price batch', {
          module: 'jobs',
          action: 'scheduled-price-update',
          batchId: batch._id,
          type: batch.type,
        });

        await priceService.applyScheduledBatch(batch._id, {
          source: 'scheduled-price-update',
        });

        batchesProcessed++;
      } catch (err) {
        logger.error('Failed to process scheduled price batch', {
          module: 'jobs',
          action: 'scheduled-price-update',
          batchId: batch._id,
          error: { message: err.message, stack: err.stack },
        });
      }
    }

    // Invalidate caches if any batches were processed
    if (batchesProcessed > 0) {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
    }

    logger.info('Scheduled price update check completed', {
      module: 'jobs',
      action: 'scheduled-price-update',
      batchesProcessed,
      totalPending: batches.length,
    });

    return { batchesProcessed };
  }
}

export default ScheduledPriceUpdateWorker;
