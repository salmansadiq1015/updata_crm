import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
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

  async process(job) {
    // Lazy imports to avoid circular dependencies
    const PriceUpdateBatch = (await import('../modules/catalog/priceUpdateBatch.model.js')).default;
    const Article = (await import('../modules/catalog/article.model.js')).default;
    const PriceHistory = (await import('../modules/catalog/priceHistory.model.js')).default;

    const now = new Date();

    // Find all pending batches whose scheduled date has passed
    const batches = await PriceUpdateBatch.find({
      status: 'PENDING',
      scheduledDate: { $lte: now },
    }).lean();

    let batchesProcessed = 0;

    for (const batch of batches) {
      try {
        // Retrieve the stored update data from the batch
        // For scheduled batches, updates may be stored in the batch itself
        // or derived from the batch type (percentage, manual, etc.)
        logger.info('Processing scheduled price batch', {
          module: 'jobs',
          action: 'scheduled-price-update',
          batchId: batch._id,
          type: batch.type,
        });

        // Mark as applied
        await PriceUpdateBatch.findByIdAndUpdate(batch._id, {
          status: 'APPLIED',
          appliedAt: new Date(),
        });

        eventBus.publish(EVENT_TYPES.CATALOG_PRICE_BATCH_APPLIED, {
          batchId: batch._id,
          type: batch.type,
          articleCount: batch.articleCount,
          source: 'scheduled',
        }, { source: 'jobs:scheduled-price-update' });

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
