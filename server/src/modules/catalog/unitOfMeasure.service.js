import unitOfMeasureRepository from './unitOfMeasure.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const UNITS_TTL = { l1Ttl: 300, l2Ttl: 900 };
const ALL_UNITS_KEY = 'catalog:units:all';

class UnitOfMeasureService {
  async list() {
    return cacheManager.getOrSet(
      ALL_UNITS_KEY,
      () => unitOfMeasureRepository.findAll(),
      UNITS_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const existing = await unitOfMeasureRepository.findByCode(data.code);
    if (existing) throw new ConflictError(`Unit of measure with code '${data.code}' already exists`);

    const unit = await unitOfMeasureRepository.create(data);
    await this._invalidateCache();

    auditService.logEvent({
      eventType: 'catalog.unit.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { code: unit.code },
      module: 'catalog',
    });

    logger.info('Unit of measure created', { module: 'catalog', action: 'create', code: unit.code });

    return unit;
  }

  async update(code, data, userId, meta = {}) {
    const existing = await unitOfMeasureRepository.findByCode(code);
    if (!existing) throw new NotFoundError('UnitOfMeasure', code);

    if (existing.isSystem && data.code && data.code !== existing.code) {
      throw new ConflictError('Cannot change the code of a system unit');
    }

    const updated = await unitOfMeasureRepository.updateByCode(code, data);
    await this._invalidateCache();

    auditService.logEvent({
      eventType: 'catalog.unit.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { code, changedFields: Object.keys(data) },
      module: 'catalog',
    });

    return updated;
  }

  async delete(code, userId, meta = {}) {
    const existing = await unitOfMeasureRepository.findByCode(code);
    if (!existing) throw new NotFoundError('UnitOfMeasure', code);

    if (existing.isSystem) {
      throw new ConflictError(
        `System unit '${code}' cannot be deleted`,
      );
    }

    const referenced = await unitOfMeasureRepository.isReferenced(code);
    if (referenced) {
      throw new ConflictError(
        `Unit '${code}' is still referenced by articles and cannot be deleted`,
      );
    }

    await unitOfMeasureRepository.deleteByCode(code);
    await this._invalidateCache();

    auditService.logEvent({
      eventType: 'catalog.unit.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { code },
      module: 'catalog',
    });

    logger.info('Unit of measure deleted', { module: 'catalog', action: 'delete', code });
  }

  async _invalidateCache() {
    await cacheManager.del(ALL_UNITS_KEY);
  }
}

const unitOfMeasureService = new UnitOfMeasureService();
export default unitOfMeasureService;
