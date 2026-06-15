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
const PRICE_BATCH_LIMIT = 10000;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

class PriceService {
  async preview(request) {
    const rows = await this._buildPreviewRows(request);
    return {
      type: request.type,
      articleCount: rows.length,
      rows,
      totals: rows.reduce(
        (acc, row) => ({
          oldPrice: round2(acc.oldPrice + row.oldPrice),
          newPrice: round2(acc.newPrice + row.newPrice),
          delta: round2(acc.delta + row.delta),
        }),
        { oldPrice: 0, newPrice: 0, delta: 0 },
      ),
    };
  }

  async listBatches(queryParams = {}) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return priceUpdateBatchRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  async updatePrice(articleId, newPrice, userId, meta = {}) {
    return this._createAndApplyBatch({
      request: { type: 'individual', articleId, newPrice },
      description: `Individual price update for ${articleId}`,
      batchType: 'MANUAL',
      userId,
      meta,
      auditEvent: 'catalog.price.updated',
    });
  }

  async bulkUpdate(updates, description, userId, meta = {}) {
    return this._createAndApplyBatch({
      request: { type: 'bulk', updates, description },
      description,
      batchType: 'MANUAL',
      userId,
      meta,
      auditEvent: 'catalog.price.bulk_updated',
    });
  }

  async percentageUpdate(filter, percentage, description, userId, meta = {}) {
    return this._createAndApplyBatch({
      request: { type: 'percentage', filter, percentage, description },
      description,
      batchType: 'PERCENTAGE',
      userId,
      meta,
      auditEvent: 'catalog.price.percentage_updated',
    });
  }

  async scheduleUpdate(batchData, userId, meta = {}) {
    const preview = await this.preview(batchData);
    const batch = await priceUpdateBatchRepository.create({
      description: batchData.description,
      type: 'SCHEDULED',
      percentage: batchData.percentage ?? null,
      articleCount: preview.articleCount,
      status: 'PENDING',
      scheduledDate: batchData.scheduledDate,
      effectiveDate: batchData.scheduledDate,
      updates: preview.rows.map((row) => ({ articleId: row.articleId, newPrice: row.newPrice })),
      filter: batchData.filter || null,
      previewRows: preview.rows,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'catalog.price.scheduled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, scheduledDate: batchData.scheduledDate, articleCount: preview.articleCount },
      module: 'catalog',
    });

    logger.info('Price update scheduled', {
      module: 'catalog',
      action: 'price.schedule',
      batchId: batch._id,
      scheduledDate: batchData.scheduledDate,
      articleCount: preview.articleCount,
    });

    return batch;
  }

  async applyScheduledBatch(batchId, meta = {}) {
    const batch = await priceUpdateBatchRepository.findById(batchId);
    if (!batch) throw new NotFoundError('PriceUpdateBatch', batchId);
    if (batch.status !== 'PENDING') {
      throw new ConflictError('Only pending scheduled price batches can be applied');
    }
    if (!batch.updates?.length) {
      throw new ConflictError('Scheduled price batch has no persisted updates to apply');
    }

    return this._applyExistingBatch(batch, batch.createdBy, meta);
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

    const bulkOps = rollbackData.map(({ articleId, oldPrice }) => ({
      updateOne: {
        filter: { _id: articleId, isDeleted: false },
        update: { $set: { basePrice: oldPrice, updatedBy: userId }, $inc: { version: 1 } },
      },
    }));

    if (bulkOps.length) await Article.bulkWrite(bulkOps, { ordered: false });

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

    await this._invalidatePriceCaches(rollbackData.map((item) => item.articleId));

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

  async _createAndApplyBatch({ request, description, batchType, userId, meta, auditEvent }) {
    const preview = await this.preview(request);
    const batch = await priceUpdateBatchRepository.create({
      description,
      type: batchType,
      percentage: request.percentage ?? null,
      articleCount: preview.articleCount,
      status: 'PENDING',
      effectiveDate: new Date(),
      updates: preview.rows.map((row) => ({ articleId: row.articleId, newPrice: row.newPrice })),
      filter: request.filter || null,
      previewRows: preview.rows,
      createdBy: userId,
    });

    const updatedBatch = await this._applyExistingBatch(batch, userId, meta);

    auditService.logEvent({
      eventType: auditEvent,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { batchId: batch._id, articleCount: preview.articleCount },
      module: 'catalog',
    });

    return updatedBatch;
  }

  async _applyExistingBatch(batch, userId, meta = {}) {
    const Article = (await import('./article.model.js')).default;
    const updates = batch.updates || [];
    const articleIds = updates.map((update) => update.articleId);
    const articles = await Article.find({ _id: { $in: articleIds }, isDeleted: false }).lean();
    const articleMap = new Map(articles.map((article) => [article._id.toString(), article]));
    const now = new Date();

    const histories = [];
    const bulkOps = [];

    for (const update of updates) {
      const article = articleMap.get(update.articleId.toString());
      if (!article) continue;
      const newPrice = round2(update.newPrice);
      histories.push({
        articleId: article._id,
        batchId: batch._id,
        oldPrice: article.basePrice,
        newPrice,
        effectiveDate: batch.effectiveDate || batch.scheduledDate || now,
        createdBy: userId,
      });
      bulkOps.push({
        updateOne: {
          filter: { _id: article._id, isDeleted: false },
          update: { $set: { basePrice: newPrice, updatedBy: userId }, $inc: { version: 1 } },
        },
      });
    }

    if (!histories.length) {
      throw new NotFoundError('Articles matching price update');
    }

    await priceHistoryRepository.bulkCreate(histories);
    await Article.bulkWrite(bulkOps, { ordered: false });

    const updatedBatch = await priceUpdateBatchRepository.updateStatus(batch._id, 'APPLIED', {
      appliedAt: now,
      articleCount: histories.length,
      rollbackUntil: new Date(now.getTime() + THIRTY_DAYS_MS),
    });

    await this._invalidatePriceCaches(histories.map((history) => history.articleId));

    eventBus.publish(EVENT_TYPES.CATALOG_PRICE_BATCH_APPLIED, {
      batchId: batch._id,
      articleCount: histories.length,
      type: batch.type,
      appliedBy: userId,
    }, { source: 'catalog:prices' });

    logger.info('Price batch applied', {
      module: 'catalog',
      action: 'price.batch_apply',
      batchId: batch._id,
      articleCount: histories.length,
      source: meta.source || 'request',
    });

    return updatedBatch;
  }

  async _buildPreviewRows(request) {
    const Article = (await import('./article.model.js')).default;
    let pairs = [];

    if (request.type === 'individual') {
      pairs = [{ articleId: request.articleId, newPrice: request.newPrice }];
    } else if (request.type === 'bulk') {
      pairs = request.updates || [];
    } else if (request.type === 'percentage') {
      const filter = { isDeleted: false, ...this._sanitizeArticleFilter(request.filter || {}) };
      const articles = await Article.find(filter)
        .select('_id basePrice')
        .limit(PRICE_BATCH_LIMIT + 1)
        .lean();
      if (articles.length > PRICE_BATCH_LIMIT) {
        throw new ConflictError(`Percentage price update exceeds ${PRICE_BATCH_LIMIT} articles`);
      }
      pairs = articles.map((article) => ({
        articleId: article._id,
        newPrice: round2(article.basePrice * (1 + request.percentage / 100)),
      }));
    }

    if (!pairs.length) throw new NotFoundError('Articles matching price update');

    const articleIds = pairs.map((pair) => pair.articleId);
    const articles = await Article.find({ _id: { $in: articleIds }, isDeleted: false })
      .select('_id articleNumber name basePrice')
      .lean();
    const articleMap = new Map(articles.map((article) => [article._id.toString(), article]));

    const rows = [];
    for (const pair of pairs) {
      const article = articleMap.get(pair.articleId.toString());
      if (!article) continue;
      const oldPrice = round2(article.basePrice);
      const newPrice = round2(pair.newPrice);
      const delta = round2(newPrice - oldPrice);
      rows.push({
        articleId: article._id,
        articleNumber: article.articleNumber,
        name: article.name,
        oldPrice,
        newPrice,
        delta,
        deltaPercent: oldPrice === 0 ? null : round2((delta / oldPrice) * 100),
      });
    }

    if (!rows.length) throw new NotFoundError('Articles matching price update');
    return rows;
  }

  _sanitizeArticleFilter(filter) {
    const allowed = {};
    for (const key of ['categoryId', 'type', 'status', 'source']) {
      if (filter[key] !== undefined) allowed[key] = filter[key];
    }
    return allowed;
  }

  async _invalidatePriceCaches(articleIds = []) {
    await Promise.all(articleIds.map((articleId) => cacheManager.del(`catalog:article:${articleId}`)));
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
  }
}

const priceService = new PriceService();
export default priceService;
