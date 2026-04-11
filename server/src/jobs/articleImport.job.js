import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Article import job.
 *
 * Processes a CSV or JSON file upload to bulk-create/update articles.
 * Accepts a base64-encoded file buffer, parses it, validates rows,
 * and upserts articles by articleNumber.
 */
export class ArticleImportWorker extends BaseWorker {
  constructor() {
    super('article-import');
  }

  async process(job) {
    const { fileBuffer, format, createdBy } = job.data;

    // Lazy import to avoid circular dependencies
    const Article = (await import('../modules/catalog/article.model.js')).default;

    const counts = { created: 0, updated: 0, skipped: 0, errors: 0 };

    try {
      // Decode base64 buffer
      const buffer = Buffer.from(fileBuffer, 'base64');
      const content = buffer.toString('utf-8');

      let rows = [];

      if (format === 'json') {
        rows = JSON.parse(content);
      } else {
        // CSV parsing — split by newline, first row is header
        const lines = content.split('\n').filter((l) => l.trim());
        if (lines.length < 2) {
          logger.warn('Article import: empty file', { module: 'jobs', action: 'article-import' });
          return counts;
        }

        const headers = lines[0].split(',').map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((v) => v.trim());
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });
          rows.push(row);
        }
      }

      // Validate and prepare bulk operations
      const bulkOps = [];
      for (const row of rows) {
        if (!row.articleNumber || !row.name) {
          counts.skipped++;
          continue;
        }

        try {
          bulkOps.push({
            updateOne: {
              filter: { articleNumber: row.articleNumber },
              update: {
                $set: {
                  name: row.name,
                  description: row.description || '',
                  basePrice: parseFloat(row.basePrice) || 0,
                  unitOfMeasure: row.unitOfMeasure || 'STK',
                  type: row.type || 'MATERIAL',
                  source: row.source || 'INTERNAL',
                  updatedBy: createdBy,
                },
                $setOnInsert: {
                  articleNumber: row.articleNumber,
                  createdBy,
                  isDeleted: false,
                },
              },
              upsert: true,
            },
          });
        } catch (err) {
          counts.errors++;
        }
      }

      if (bulkOps.length) {
        const result = await Article.bulkWrite(bulkOps);
        counts.created = result.upsertedCount || 0;
        counts.updated = result.modifiedCount || 0;
      }

      // Invalidate caches
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Article import completed', {
        module: 'jobs',
        action: 'article-import',
        ...counts,
        totalRows: rows.length,
      });

      return counts;
    } catch (err) {
      logger.error('Article import failed', {
        module: 'jobs',
        action: 'article-import',
        error: { message: err.message, stack: err.stack },
      });

      throw err;
    }
  }
}

export default ArticleImportWorker;
