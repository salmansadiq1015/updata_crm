import articleRepository from './article.repository.js';
import articleVersionRepository from './articleVersion.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import {
  normalizeArticlePayload,
  normalizeSearchTerm,
} from './catalogNormalization.js';
import catalogSearchService from './catalogSearch.service.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class ArticleService {
  async create(data, createdBy, meta = {}) {
    const payload = normalizeArticlePayload(data);
    // Validate categoryId exists
    const catalogCategoryRepository = (await import('./catalogCategory.repository.js')).default;
    const category = await catalogCategoryRepository.findById(payload.categoryId);
    if (!category) throw new NotFoundError('CatalogCategory', payload.categoryId);

    // Validate unitOfMeasure exists
    const unitOfMeasureRepository = (await import('./unitOfMeasure.repository.js')).default;
    const unit = await unitOfMeasureRepository.findByCode(payload.unitOfMeasure);
    if (!unit) throw new NotFoundError('UnitOfMeasure', payload.unitOfMeasure);

    const article = await articleRepository.create({ ...payload, createdBy });
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_CREATED, {
      articleId: article._id,
      articleNumber: article.articleNumber,
      name: article.name,
      type: article.type,
      createdBy,
    }, { source: 'catalog:articles' });

    auditService.logEvent({
      eventType: 'catalog.article.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { articleId: article._id, articleNumber: article.articleNumber },
      module: 'catalog',
    });

    logger.info('Article created', { module: 'catalog', action: 'create', articleId: article._id, articleNumber: article.articleNumber });

    return articleRepository.findById(article._id);
  }

  async getById(id) {
    const cacheKey = `catalog:article:${id}`;
    const article = await cacheManager.getOrSet(
      cacheKey,
      () => articleRepository.findById(id),
      ENTITY_TTL,
    );
    if (!article) throw new NotFoundError('Article', id);
    return article;
  }

  async list(queryParams, meta = {}) {
    const { cursor, limit, sortBy, sortOrder, ...rawFilters } = queryParams;
    const search = normalizeSearchTerm(queryParams);
    const filters = { ...rawFilters };
    delete filters.q;
    delete filters.search;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `catalog:articles:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    const result = await cacheManager.getOrSet(
      cacheKey,
      () => articleRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
    if (search) {
      catalogSearchService.recordSearch({
        userId: meta.userId,
        queryParams,
        resultCount: result.data?.length ?? 0,
        surface: meta.surface || 'articles',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }).catch(() => {});
    }
    return result;
  }

  async getFacets(filter = {}) {
    const cacheKey = `catalog:facets:${JSON.stringify(filter)}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => articleRepository.getFacets(filter),
      { l1Ttl: 30, l2Ttl: 120 },
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await articleRepository.findById(id);
    if (!existing) throw new NotFoundError('Article', id);

    if (data.articleNumber && data.articleNumber !== existing.articleNumber) {
      throw new ConflictError('Article number is immutable and cannot be changed');
    }

    if (Number(data.version) !== Number(existing.version)) {
      throw new ConflictError('Article has been modified by another user', {
        currentVersion: existing.version,
        submittedVersion: data.version,
      });
    }

    // Remove articleNumber from data if present (immutable)
    const rawUpdateData = { ...data };
    delete rawUpdateData.articleNumber;
    delete rawUpdateData.version;
    const updateData = normalizeArticlePayload(rawUpdateData);

    if (updateData.categoryId) {
      const catalogCategoryRepository = (await import('./catalogCategory.repository.js')).default;
      const category = await catalogCategoryRepository.findById(updateData.categoryId);
      if (!category) throw new NotFoundError('CatalogCategory', updateData.categoryId);
    }

    if (updateData.unitOfMeasure) {
      const unitOfMeasureRepository = (await import('./unitOfMeasure.repository.js')).default;
      const unit = await unitOfMeasureRepository.findByCode(updateData.unitOfMeasure);
      if (!unit) throw new NotFoundError('UnitOfMeasure', updateData.unitOfMeasure);
    }

    // Create version snapshot before update
    await articleVersionRepository.create({
      articleId: id,
      version: existing.version,
      snapshot: existing,
      changedFields: Object.keys(updateData),
      createdBy: updatedBy,
    });

    const updated = await articleRepository.updateById(
      id,
      { ...updateData, updatedBy },
      { expectedVersion: existing.version },
    );
    if (!updated) {
      throw new ConflictError('Article has been modified by another user', {
        currentVersion: existing.version,
        submittedVersion: data.version,
      });
    }
    await this._invalidateArticleCache(id);
    await this._invalidateListCache();

    // If price changed, publish price change event
    if (updateData.basePrice !== undefined && updateData.basePrice !== existing.basePrice) {
      eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_PRICE_CHANGED, {
        articleId: id,
        articleNumber: existing.articleNumber,
        oldPrice: existing.basePrice,
        newPrice: updateData.basePrice,
        updatedBy,
      }, { source: 'catalog:articles' });
    }

    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_UPDATED, {
      articleId: id,
      changedFields: Object.keys(updateData),
      updatedBy,
    }, { source: 'catalog:articles' });

    auditService.logEvent({
      eventType: 'catalog.article.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { articleId: id, changedFields: Object.keys(updateData) },
      module: 'catalog',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const article = await articleRepository.findById(id);
    if (!article) throw new NotFoundError('Article', id);

    await articleRepository.softDelete(id);
    await this._invalidateArticleCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_DELETED, {
      articleId: id,
      articleNumber: article.articleNumber,
      deletedBy,
    }, { source: 'catalog:articles' });

    auditService.logEvent({
      eventType: 'catalog.article.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { articleId: id, articleNumber: article.articleNumber },
      module: 'catalog',
    });
  }

  async bulkImport(file, format, userId, meta = {}) {
    const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
    const crypto = await import('crypto');
    const jobId = crypto.randomUUID();
    if (!file?.buffer) {
      throw new ConflictError('Import file is required');
    }
    const resolvedFormat = format || this._inferImportFormat(file);

    await queueManager.addJob('article-import', `import-${jobId}`, {
      fileBuffer: file.buffer.toString('base64'),
      format: resolvedFormat,
      createdBy: userId,
      meta: { ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    });

    logger.info('Article bulk import queued', {
      module: 'catalog',
      action: 'bulkImport',
      jobId,
      format: resolvedFormat,
    });

    return { jobId, status: 'QUEUED', format: resolvedFormat };
  }

  importTemplate() {
    const header = [
      'articleNumber',
      'name',
      'description',
      'categoryId',
      'type',
      'unitOfMeasure',
      'basePrice',
      'purchasePrice',
      'salesPrice',
      'currency',
      'supplierName',
      'supplierReference',
      'manufacturerName',
      'manufacturerPartNumber',
      'productGroup',
      'ighArticleNumber',
      'source',
      'status',
      'availabilityStatus',
      'availableQuantity',
    ];
    const sample = [
      'MB-HK-0042',
      'Brennwertkessel BW-200',
      'Condensing boiler, 200kW',
      'REPLACE_WITH_CATEGORY_ID',
      'MATERIAL',
      'STK',
      '12500.00',
      '10000.00',
      '12500.00',
      'CHF',
      'Boiler Supplier AG',
      'SUP-BW200',
      'Updata',
      'BW-200',
      'Boiler',
      '',
      'SUPPLIER',
      'ACTIVE',
      'IN_STOCK',
      '4',
    ];
    return `${header.join(',')}\n${sample.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')}\n`;
  }

  async getVersions(articleId, params = {}) {
    return articleVersionRepository.findByArticleId(articleId, params);
  }

  async getVersion(articleId, version) {
    const ver = await articleVersionRepository.findByArticleIdAndVersion(articleId, version);
    if (!ver) throw new NotFoundError('ArticleVersion', `${articleId}/v${version}`);
    return ver;
  }

  async markUsed(articleId) {
    await articleRepository.updateLastUsedAt(articleId);

    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_USED, {
      articleId,
    }, { source: 'catalog:articles' });
  }

  async _invalidateArticleCache(id) {
    await cacheManager.del(`catalog:article:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
    // Per-category article counts are embedded in the category tree/list, so a created,
    // moved or deleted article must also refresh those caches — otherwise the tree
    // counters stay stale until their TTL expires.
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:categories:tree:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:categories:list:*`);
  }

  _inferImportFormat(file) {
    const name = String(file?.originalname || '').toLowerCase();
    const mimetype = String(file?.mimetype || '').toLowerCase();
    if (name.endsWith('.json') || mimetype.includes('json')) return 'json';
    if (name.endsWith('.csv') || mimetype.includes('csv') || mimetype.includes('text/plain')) return 'csv';
    throw new ConflictError('Unsupported import format. Upload CSV or JSON.');
  }
}

const articleService = new ArticleService();
export default articleService;
