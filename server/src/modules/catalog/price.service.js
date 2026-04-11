import priceHistoryRepository from './priceHistory.repository.js';
import priceUpdateBatchRepository from './priceUpdateBatch.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

class PriceService {
  async updatePrice(articleId, newPrice, userId, meta = {}) {
    const { default: articleRepository } = await import('./article.repository.js');

    const article = await articleRepository.findById(articleId);
    if (!article) throw new NotFoundError('Article', articleId);

    const oldPrice = article.basePrice;

    await priceHistoryRepository.create({
      articleId,
      oldPrice,
      newPrice,
      effectiveDate: new Date(),
      createdBy: userId,
    });

    const updated = await articleRepository.updateById(articleId, { basePrice: newPrice });

    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_PRICE_CHANGED, {
      articleId,
      oldPrice,
      newPrice,
      changedBy: userId,
    }, { source: 'catalog:prices' });

    auditService.logEvent({
      eventType: 'catalog.price.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { articleId, oldPrice, newPrice },
      module: 'catalog',
    });

    logger.info('Article price updated', {
      module: 'catalog',
      action: 'price.update',
      articleId,
      oldPrice,
      newPrice,
    });

    return updated;
  }

  async bulkUpdate(updates, description, userId, meta = {}) {
    const { default: articleRepository } = await import('./article.repository.js');
    const Article = (await import('./article.model.js')).default;

    const batch = await priceUpdateBatchRepository.create({
      description,
      type: 'MANUAL',
      articleCount: updates.length,
      createdBy: userId,
    });

    const articleIds = updates.map((u) => u.articleId);
    const articles = await Article.find({ _id: { $in: articleIds }, isDeleted: false }).lean();
    const articleMap = new Map(articles.map((a) => [a._id.toString(), a]));

    const histories = [];
    const bulkOps = [];

    for (const { articleId, newPrice } of updates) {
      const article = articleMap.get(articleId.toString());
      if (!article) continue;

      histories.push({
        articleId,
        batchId: batch._id,
        oldPrice: article.basePrice,
        newPrice,
        effectiveDate: new Date(),
        createdBy: userId,
      });

      bulkOps.push({
        updateOne: {
          filter: { _id: articleId },
          update: { $set: { basePrice: newPrice } },
        },
      });
    }

    if (histories.length) await priceHistoryRepository.bulkCreate(histories);
    if (bulkOps.length) await Article.bulkWrite(bulkOps);

    const updatedBatch = await priceUpdateBatchRepository.updateStatus(batch._id, 'APPLIED', {
      appliedAt: new Date(),
      articleCount: histories.length,
    });

    eventBus.publish(EVENT_TYPES.CATALOG_PRICE_BATCH_APPLIED, {
      batchId: batch._id,
      articleCount: histories.length,
      type: 'MANUAL',
      appliedBy: userId,
    }, { source: 'catalog:prices' });

    // Invalidate article caches
    for (const { articleId } of updates) {
      await cacheManager.del(`catalog:article:${articleId}`);
    }
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);

    auditService.logEvent({
      eventType: 'catalog.price.bulk_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, articleCount: histories.length },
      module: 'catalog',
    });

    logger.info('Bulk price update applied', {
      module: 'catalog',
      action: 'price.bulk_update',
      batchId: batch._id,
      articleCount: histories.length,
    });

    return updatedBatch;
  }

  async percentageUpdate(filter, percentage, description, userId, meta = {}) {
    const Article = (await import('./article.model.js')).default;

    const query = { isDeleted: false, ...filter };
    const articles = await Article.find(query).lean();

    if (!articles.length) throw new NotFoundError('Articles matching filter');

    const updates = articles.map((a) => ({
      articleId: a._id,
      newPrice: Math.round((a.basePrice * (1 + percentage / 100)) * 100) / 100,
    }));

    const batch = await priceUpdateBatchRepository.create({
      description,
      type: 'PERCENTAGE',
      percentage,
      articleCount: updates.length,
      createdBy: userId,
    });

    const histories = articles.map((a, i) => ({
      articleId: a._id,
      batchId: batch._id,
      oldPrice: a.basePrice,
      newPrice: updates[i].newPrice,
      effectiveDate: new Date(),
      createdBy: userId,
    }));

    const bulkOps = updates.map(({ articleId, newPrice }) => ({
      updateOne: {
        filter: { _id: articleId },
        update: { $set: { basePrice: newPrice } },
      },
    }));

    if (histories.length) await priceHistoryRepository.bulkCreate(histories);
    if (bulkOps.length) await Article.bulkWrite(bulkOps);

    const updatedBatch = await priceUpdateBatchRepository.updateStatus(batch._id, 'APPLIED', {
      appliedAt: new Date(),
    });

    eventBus.publish(EVENT_TYPES.CATALOG_PRICE_BATCH_APPLIED, {
      batchId: batch._id,
      articleCount: updates.length,
      type: 'PERCENTAGE',
      percentage,
      appliedBy: userId,
    }, { source: 'catalog:prices' });

    for (const { articleId } of updates) {
      await cacheManager.del(`catalog:article:${articleId}`);
    }
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);

    auditService.logEvent({
      eventType: 'catalog.price.percentage_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, percentage, articleCount: updates.length },
      module: 'catalog',
    });

    logger.info('Percentage price update applied', {
      module: 'catalog',
      action: 'price.percentage_update',
      batchId: batch._id,
      percentage,
      articleCount: updates.length,
    });

    return updatedBatch;
  }

  async scheduleUpdate(batchData, userId, meta = {}) {
    const batch = await priceUpdateBatchRepository.create({
      ...batchData,
      type: batchData.type || 'SCHEDULED',
      status: 'PENDING',
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'catalog.price.scheduled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, scheduledDate: batchData.scheduledDate },
      module: 'catalog',
    });

    logger.info('Price update scheduled', {
      module: 'catalog',
      action: 'price.schedule',
      batchId: batch._id,
      scheduledDate: batchData.scheduledDate,
    });

    return batch;
  }

  async rollback(batchId, userId, meta = {}) {
    const batch = await priceUpdateBatchRepository.findById(batchId);
    if (!batch) throw new NotFoundError('PriceUpdateBatch', batchId);

    if (batch.status !== 'APPLIED') {
      throw new ConflictError('Only batches with status APPLIED can be rolled back');
    }

    const appliedAt = new Date(batch.appliedAt);
    if (Date.now() - appliedAt.getTime() > THIRTY_DAYS_MS) {
      throw new AppError(
        'Rollback window has expired (30 days)',
        400,
        ERROR_CODES.CATALOG_PRICE_ROLLBACK_EXPIRED,
      );
    }

    const rollbackData = await priceHistoryRepository.findRollbackData(batchId);
    const Article = (await import('./article.model.js')).default;

    // Restore old prices
    const bulkOps = rollbackData.map(({ articleId, oldPrice }) => ({
      updateOne: {
        filter: { _id: articleId },
        update: { $set: { basePrice: oldPrice } },
      },
    }));

    if (bulkOps.length) await Article.bulkWrite(bulkOps);

    // Create new PriceHistory entries for the rollback
    const rollbackHistories = rollbackData.map(({ articleId, oldPrice, newPrice }) => ({
      articleId,
      batchId,
      oldPrice: newPrice,
      newPrice: oldPrice,
      effectiveDate: new Date(),
      createdBy: userId,
    }));

    if (rollbackHistories.length) await priceHistoryRepository.bulkCreate(rollbackHistories);

    const updatedBatch = await priceUpdateBatchRepository.updateStatus(batchId, 'ROLLED_BACK', {
      rolledBackAt: new Date(),
    });

    // Invalidate caches
    for (const { articleId } of rollbackData) {
      await cacheManager.del(`catalog:article:${articleId}`);
    }
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);

    auditService.logEvent({
      eventType: 'catalog.price.rolled_back',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId, articleCount: rollbackData.length },
      module: 'catalog',
    });

    logger.info('Price batch rolled back', {
      module: 'catalog',
      action: 'price.rollback',
      batchId,
      articleCount: rollbackData.length,
    });

    return updatedBatch;
  }

  async getHistory(articleId, params = {}) {
    const { from, to } = params;
    return priceHistoryRepository.findByArticleId(articleId, { from, to });
  }
}

const priceService = new PriceService();
export default priceService;
