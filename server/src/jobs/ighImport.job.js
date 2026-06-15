import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * IGH import job.
 *
 * Processes full and delta imports from the configured IGH catalog feed.
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
    const CatalogCategory = (await import('../modules/catalog/catalogCategory.model.js')).default;
    const { default: axios } = await import('axios');
    const {
      parseIghCsv,
      parseIghJson,
      parseIghXml,
      batchUpsertArticles,
    } = await import('../modules/catalog/igh-import-adapters.js');

    try {
      // Update job status to RUNNING and retrieve createdBy (the triggering user)
      const importJobDoc = await IghImportJob.findByIdAndUpdate(
        importJobId,
        { status: 'RUNNING', startedAt: new Date() },
        { returnDocument: 'after' },
      ).lean();
      const importedBy = importJobDoc?.createdBy ?? null;

      // Load config
      const cfg = await IghConfig.findOne().lean();
      if (!cfg || !cfg.isEnabled) {
        throw new Error('IGH integration is disabled');
      }

      if (!cfg.endpointUrl) {
        throw new Error('IGH endpoint URL is not configured');
      }

      // Resolve a default category for new IGH articles (categoryId is required on Article)
      const ighCategory = await CatalogCategory.findOne({ code: 'IGH' }).lean().select('_id');
      const fallbackCategory = ighCategory ?? (await CatalogCategory.findOne().lean().select('_id'));
      const defaultCategoryId = fallbackCategory?._id ?? null;

      await IghImportJob.findByIdAndUpdate(importJobId, {
        log: 'Connecting to IGH data source...',
      });

      logger.info('IGH import started', {
        module: 'jobs',
        action: 'igh-import',
        type,
        importJobId,
      });

      // Fetch with up to 3 retries and exponential backoff
      let response;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await axios.get(cfg.endpointUrl, {
            headers: cfg.credentials?.apiKey
              ? { Authorization: `Bearer ${cfg.credentials.apiKey}` }
              : {},
            params: type === 'DELTA' && cfg.lastSyncAt
              ? { since: cfg.lastSyncAt.toISOString() }
              : {},
            timeout: 120_000,
            responseType: 'text',
          });
          break;
        } catch (fetchErr) {
          if (attempt === 3) throw fetchErr;
          await IghImportJob.findByIdAndUpdate(importJobId, {
            log: `Attempt ${attempt} failed, retrying in ${attempt * 2}s...`,
          });
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }

      await IghImportJob.findByIdAndUpdate(importJobId, {
        log: `Downloaded ${String(response.data).length} chars. Parsing...`,
      });

      // Detect format and parse
      let articles;
      const contentType = (response.headers['content-type'] ?? '').toLowerCase();
      const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (contentType.includes('json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        articles = parseIghJson(Array.isArray(json) ? json : (json.articles ?? json.data ?? []));
      } else if (contentType.includes('xml') || rawText.trim().startsWith('<')) {
        articles = parseIghXml(rawText);
      } else {
        articles = parseIghCsv(rawText);
      }

      await IghImportJob.findByIdAndUpdate(importJobId, {
        log: `Parsed ${articles.length} articles. Upserting in batches of 500...`,
      });

      await job.updateProgress(30);

      const result = await batchUpsertArticles(articles, importedBy, defaultCategoryId);

      // Update last sync timestamp using the specific document to avoid phantom updates
      await IghConfig.findOneAndUpdate({ _id: cfg._id }, { lastSyncAt: new Date() });

      const counts = {
        articlesCreated: result.upsertedCount,
        articlesUpdated: result.modifiedCount,
        articlesSkipped: 0,
        errorsCount: result.errors.length,
      };

      // Update job with completed status
      await IghImportJob.findByIdAndUpdate(importJobId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...counts,
        log: `${type} import completed. Created: ${result.upsertedCount}, Updated: ${result.modifiedCount}, Errors: ${result.errors.length}`,
      });

      // Invalidate caches
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
      await cacheManager.del('catalog:igh:config');

      eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_COMPLETED, {
        jobId: importJobId,
        type,
        ...counts,
      }, { source: 'jobs:igh-import' });

      logger.info('IGH import completed', {
        module: 'jobs',
        action: 'igh-import',
        type,
        importJobId,
        ...counts,
      });

      await job.updateProgress(100);
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
