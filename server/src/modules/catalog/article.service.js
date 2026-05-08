import articleRepository from './article.repository.js';
import articleVersionRepository from './articleVersion.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class ArticleService {
  async create(data, createdBy, meta = {}) {
    // Validate categoryId exists
    const catalogCategoryRepository = (await import('./catalogCategory.repository.js')).default;
    const category = await catalogCategoryRepository.findById(data.categoryId);
    if (!category) throw new NotFoundError('CatalogCategory', data.categoryId);

    // Validate unitOfMeasure exists
    const unitOfMeasureRepository = (await import('./unitOfMeasure.repository.js')).default;
    const unit = await unitOfMeasureRepository.findByCode(data.unitOfMeasure);
    if (!unit) throw new NotFoundError('UnitOfMeasure', data.unitOfMeasure);

    const article = await articleRepository.create({ ...data, createdBy });
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

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `catalog:articles:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => articleRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
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

    // Remove articleNumber from data if present (immutable)
    const { articleNumber, ...updateData } = data;

    // Create version snapshot before update
    await articleVersionRepository.create({
      articleId: id,
      version: existing.version,
      snapshot: existing,
      changedFields: Object.keys(updateData),
      createdBy: updatedBy,
    });

    const updated = await articleRepository.updateById(id, { ...updateData, updatedBy });
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

  async bulkImport(fileBuffer, format, userId, meta = {}) {
    const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
    const crypto = await import('crypto');
    const jobId = crypto.randomUUID();

    await queueManager.addJob('article-import', `import-${jobId}`, {
      fileBuffer: fileBuffer.toString('base64'),
      format,
      importedBy: userId,
      meta: { ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    });

    logger.info('Article bulk import queued', { module: 'catalog', action: 'bulkImport', jobId });

    return { jobId, status: 'QUEUED' };
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
  }
}

const articleService = new ArticleService();
export default articleService;
