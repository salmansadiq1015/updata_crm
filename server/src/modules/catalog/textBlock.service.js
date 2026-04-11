import textBlockRepository from './textBlock.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class TextBlockService {
  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `catalog:textblocks:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => textBlockRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async getById(id) {
    const cacheKey = `catalog:textblock:${id}`;
    const textBlock = await cacheManager.getOrSet(
      cacheKey,
      () => textBlockRepository.findById(id),
      ENTITY_TTL,
    );
    if (!textBlock) throw new NotFoundError('TextBlock', id);
    return textBlock;
  }

  async create(data, createdBy, meta = {}) {
    const textBlock = await textBlockRepository.create({ ...data, createdBy });
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CATALOG_TEXT_BLOCK_CREATED, {
      textBlockId: textBlock._id,
      title: textBlock.title,
      createdBy,
    }, { source: 'catalog:textblocks' });

    auditService.logEvent({
      eventType: 'catalog.textblock.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { textBlockId: textBlock._id },
      module: 'catalog',
    });

    logger.info('Text block created', { module: 'catalog', action: 'create', textBlockId: textBlock._id });

    return textBlock;
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await textBlockRepository.findById(id);
    if (!existing) throw new NotFoundError('TextBlock', id);

    const updated = await textBlockRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateTextBlockCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CATALOG_TEXT_BLOCK_UPDATED, {
      textBlockId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'catalog:textblocks' });

    auditService.logEvent({
      eventType: 'catalog.textblock.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { textBlockId: id, changedFields: Object.keys(data) },
      module: 'catalog',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const textBlock = await textBlockRepository.findById(id);
    if (!textBlock) throw new NotFoundError('TextBlock', id);

    await textBlockRepository.softDelete(id);
    await this._invalidateTextBlockCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'catalog.textblock.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { textBlockId: id },
      module: 'catalog',
    });
  }

  async _invalidateTextBlockCache(id) {
    await cacheManager.del(`catalog:textblock:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:textblocks:list:*`);
  }
}

const textBlockService = new TextBlockService();
export default textBlockService;
