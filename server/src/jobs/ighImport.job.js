import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * IGH import job.
 *
 * Processes a full or delta import from the IGH catalog API.
 * Currently a placeholder — actual IGH API integration will be added
 * once the external API specification is finalized.
 */
export class IghImportWorker extends BaseWorker {
  constructor() {
    super('igh-import');
  }

  async process(job) {
    const { importJobId, type } = job.data;

    // Lazy import to avoid circular dependencies
    const IghImportJob = (await import('../modules/catalog/ighImportJob.model.js')).default;
    const IghConfig = (await import('../modules/catalog/ighConfig.model.js')).default;

    // Update job status to RUNNING
    await IghImportJob.findByIdAndUpdate(importJobId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });

    try {
      // Load config
      const cfg = await IghConfig.findOne().lean();
      if (!cfg || !cfg.isEnabled) {
        throw new Error('IGH integration is disabled');
      }

      // --- Placeholder: simulate IGH API fetch ---
      // Actual implementation will fetch from cfg.endpointUrl
      // with cfg.credentials, parse the response, and upsert articles.
      logger.info('IGH import started (placeholder)', {
        module: 'jobs',
        action: 'igh-import',
        type,
        importJobId,
      });

      const counts = {
        articlesCreated: 0,
        articlesUpdated: 0,
        articlesSkipped: 0,
        errorsCount: 0,
      };

      // Update job with completed status
      await IghImportJob.findByIdAndUpdate(importJobId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...counts,
        log: `${type} import completed successfully at ${new Date().toISOString()}. No articles processed (placeholder).`,
      });

      // Update last sync timestamp
      await IghConfig.findOneAndUpdate({}, { lastSyncAt: new Date() });

      eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_COMPLETED, {
        jobId: importJobId,
        type,
        ...counts,
      }, { source: 'jobs:igh-import' });

      // Invalidate caches
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
      await cacheManager.del('catalog:igh:config');

      logger.info('IGH import completed', {
        module: 'jobs',
        action: 'igh-import',
        type,
        importJobId,
        ...counts,
      });

      return counts;
    } catch (err) {
      // Set job status to FAILED
      await IghImportJob.findByIdAndUpdate(importJobId, {
        status: 'FAILED',
        completedAt: new Date(),
        log: `${type} import failed: ${err.message}`,
      });

      eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_FAILED, {
        jobId: importJobId,
        type,
        error: err.message,
      }, { source: 'jobs:igh-import' });

      logger.error('IGH import failed', {
        module: 'jobs',
        action: 'igh-import',
        type,
        importJobId,
        error: { message: err.message, stack: err.stack },
      });

      throw err;
    }
  }
}

export default IghImportWorker;
