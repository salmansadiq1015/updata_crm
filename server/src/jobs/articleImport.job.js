import { parse } from 'csv-parse/sync';
import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';
import { normalizeArticlePayload } from '../modules/catalog/catalogNormalization.js';

export class ArticleImportWorker extends BaseWorker {
  constructor() {
    super('article-import');
  }

  async process(job) {
    const { fileBuffer, format, createdBy } = job.data;

    const Article = (await import('../modules/catalog/article.model.js')).default;
    const CatalogCategory = (await import('../modules/catalog/catalogCategory.model.js')).default;
    const UnitOfMeasure = (await import('../modules/catalog/unitOfMeasure.model.js')).default;

    const counts = { created: 0, updated: 0, skipped: 0, errors: 0, rowErrors: [] };

    try {
      const content = Buffer.from(fileBuffer, 'base64').toString('utf-8');
      const rows = this._parseRows(content, format);

      const [categories, units] = await Promise.all([
        CatalogCategory.find({ status: 'ACTIVE' }).select('_id').lean(),
        UnitOfMeasure.find().select('code').lean(),
      ]);
      const categoryIds = new Set(categories.map((category) => category._id.toString()));
      const unitCodes = new Set(units.map((unit) => unit.code));

      const bulkOps = [];
      rows.forEach((row, index) => {
        const payload = normalizeArticlePayload({
          articleNumber: row.articleNumber,
          name: row.name,
          description: row.description || '',
          categoryId: row.categoryId,
          basePrice: Number.parseFloat(row.basePrice ?? 0) || 0,
          purchasePrice: Number.parseFloat(row.purchasePrice ?? row.basePrice ?? 0) || 0,
          salesPrice: Number.parseFloat(row.salesPrice ?? row.basePrice ?? 0) || 0,
          unitOfMeasure: row.unitOfMeasure || 'STK',
          type: row.type || 'MATERIAL',
          currency: row.currency || 'CHF',
          catalogConnectionId: row.catalogConnectionId || null,
          externalCatalogItemId: row.externalCatalogItemId || null,
          supplierId: row.supplierId || null,
          supplierName: row.supplierName || null,
          supplierReference: row.supplierReference || null,
          manufacturerName: row.manufacturerName || null,
          manufacturerPartNumber: row.manufacturerPartNumber || null,
          productGroup: row.productGroup || null,
          ighArticleNumber: row.ighArticleNumber || null,
          source: row.source || 'INTERNAL',
          status: row.status || 'ACTIVE',
          availabilityStatus: row.availabilityStatus || 'UNKNOWN',
          availableQuantity: row.availableQuantity !== undefined ? Number.parseFloat(row.availableQuantity) : null,
        });

        const rowErrors = this._validateRow(payload, categoryIds, unitCodes);
        if (rowErrors.length) {
          counts.skipped += 1;
          counts.errors += 1;
          counts.rowErrors.push({
            row: format === 'json' ? index + 1 : index + 2,
            articleNumber: payload.articleNumber || null,
            errors: rowErrors,
          });
          return;
        }

        bulkOps.push({
          updateOne: {
            filter: { articleNumber: payload.articleNumber },
            update: {
              $set: {
                name: payload.name,
                description: payload.description,
                categoryId: payload.categoryId,
                basePrice: payload.basePrice,
                purchasePrice: payload.purchasePrice,
                salesPrice: payload.salesPrice,
                unitOfMeasure: payload.unitOfMeasure,
                type: payload.type,
                currency: payload.currency,
                catalogConnectionId: payload.catalogConnectionId,
                externalCatalogItemId: payload.externalCatalogItemId,
                supplierId: payload.supplierId,
                supplierName: payload.supplierName,
                supplierReference: payload.supplierReference,
                manufacturerName: payload.manufacturerName,
                manufacturerPartNumber: payload.manufacturerPartNumber,
                productGroup: payload.productGroup,
                ighArticleNumber: payload.ighArticleNumber,
                source: payload.source,
                status: payload.status,
                availabilityStatus: payload.availabilityStatus,
                availableQuantity: payload.availableQuantity,
                searchTokens: payload.searchTokens,
                updatedBy: createdBy,
              },
              $setOnInsert: {
                articleNumber: payload.articleNumber,
                createdBy,
                isDeleted: false,
              },
              $inc: { version: 1 },
            },
            upsert: true,
          },
        });
      });

      if (bulkOps.length) {
        const result = await Article.bulkWrite(bulkOps, { ordered: false });
        counts.created = result.upsertedCount || 0;
        counts.updated = result.modifiedCount || 0;
      }

      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Article import completed', {
        module: 'jobs',
        action: 'article-import',
        ...counts,
        rowErrorCount: counts.rowErrors.length,
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

  _parseRows(content, format) {
    if (format === 'json') {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : parsed.rows || parsed.articles || [];
    }

    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  }

  _validateRow(payload, categoryIds, unitCodes) {
    const errors = [];
    if (!payload.articleNumber) errors.push('articleNumber is required');
    if (!payload.name) errors.push('name is required');
    if (!payload.categoryId || !categoryIds.has(String(payload.categoryId))) {
      errors.push('categoryId must reference an active category');
    }
    if (!unitCodes.has(payload.unitOfMeasure)) {
      errors.push(`unitOfMeasure '${payload.unitOfMeasure}' does not exist`);
    }
    if (!['MATERIAL', 'SERVICE'].includes(payload.type)) errors.push('type must be MATERIAL or SERVICE');
    if (!['INTERNAL', 'IGH', 'SUPPLIER', 'MANUFACTURER'].includes(payload.source)) {
      errors.push('source must be INTERNAL, IGH, SUPPLIER, or MANUFACTURER');
    }
    if (!['ACTIVE', 'INACTIVE'].includes(payload.status)) errors.push('status must be ACTIVE or INACTIVE');
    return errors;
  }
}

export default ArticleImportWorker;
