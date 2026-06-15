import unitOfMeasureRepository from './unitOfMeasure.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import { normalizeUnitCode } from './catalogNormalization.js';

const UNITS_TTL = { l1Ttl: 300, l2Ttl: 900 };
const ALL_UNITS_KEY = 'catalog:units:all';

class UnitOfMeasureService {
  async list() {
    return cacheManager.getOrSet(
      ALL_UNITS_KEY,
      async () => {
        const [units, usageCounts] = await Promise.all([
          unitOfMeasureRepository.findAll(),
          unitOfMeasureRepository.usageCountsByCode(),
        ]);
        return units.map((unit) => ({
          ...unit,
          usageCount: usageCounts.get(unit.code) || 0,
        }));
      },
      UNITS_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const payload = { ...data, code: normalizeUnitCode(data.code) };
    const existing = await unitOfMeasureRepository.findByCode(payload.code);
    if (existing) throw new ConflictError(`Unit of measure with code '${payload.code}' already exists`);

    const unit = await unitOfMeasureRepository.create(payload);
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

    const referenceCount = await unitOfMeasureRepository.referenceCount(code);
    if (referenceCount > 0) {
      throw new ConflictError(
        `Unit '${code}' is still referenced by articles and cannot be deleted`,
        { referenceCount },
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
