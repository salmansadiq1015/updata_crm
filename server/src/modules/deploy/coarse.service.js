import coarseRepository from './coarse.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const COARSE_TTL = { l1Ttl: 60, l2Ttl: 300 };

class CoarseService {
  async getMatrix(year, weekFrom, weekTo, filters = {}) {
    const { employeeIds, projectId } = filters;
    const filterKey = [
      year, weekFrom, weekTo,
      employeeIds?.join(',') || '',
      projectId || '',
    ].join(':');
    const cacheKey = `deploy:coarse:matrix:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => coarseRepository.findByWeekRange(year, weekFrom, weekTo, { employeeIds, projectId }),
      COARSE_TTL,
    );
  }

  async create(data, createdBy, meta = {}) {
    const existing = await coarseRepository.findByEmployeeProjectWeek(
      data.employeeId,
      data.projectId,
      data.calendarYear,
      data.calendarWeek,
    );
    if (existing) {
      throw new ConflictError('Coarse allocation already exists for this employee, project, and week.');
    }

    const currentSum = await coarseRepository.sumAllocationsForEmployeeWeek(
      data.employeeId,
      data.calendarYear,
      data.calendarWeek,
    );

    if (currentSum + data.allocationPercent > 100) {
      throw new ConflictError(
        `Total allocation would be ${currentSum + data.allocationPercent}% (max 100%)`,
      );
    }

    const allocation = await coarseRepository.create({ ...data, createdBy });
    await this._invalidateCoarseCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_COARSE_ALLOCATION_CHANGED, {
      allocationId: allocation._id,
      employeeId: data.employeeId,
      projectId: data.projectId,
      calendarYear: data.calendarYear,
      calendarWeek: data.calendarWeek,
      action: 'created',
      createdBy,
    }, { source: 'deploy:coarse' });

    auditService.logEvent({
      eventType: 'coarse_allocation.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { allocationId: allocation._id, employeeId: data.employeeId, projectId: data.projectId },
      module: 'deploy',
    });

    logger.info('Coarse allocation created', {
      module: 'deploy',
      action: 'coarse.create',
      allocationId: allocation._id,
    });

    return coarseRepository.findById(allocation._id);
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await coarseRepository.findById(id);
    if (!existing) throw new NotFoundError('CoarseAllocation', id);

    if (data.allocationPercent !== undefined && data.allocationPercent !== existing.allocationPercent) {
      const currentSum = await coarseRepository.sumAllocationsForEmployeeWeek(
        existing.employeeId._id || existing.employeeId,
        existing.calendarYear,
        existing.calendarWeek,
        id,
      );

      if (currentSum + data.allocationPercent > 100) {
        throw new ConflictError(
          `Total allocation would be ${currentSum + data.allocationPercent}% (max 100%)`,
        );
      }
    }

    const updated = await coarseRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateCoarseCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_COARSE_ALLOCATION_CHANGED, {
      allocationId: id,
      action: 'updated',
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'deploy:coarse' });

    auditService.logEvent({
      eventType: 'coarse_allocation.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { allocationId: id, changedFields: Object.keys(data) },
      module: 'deploy',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await coarseRepository.findById(id);
    if (!existing) throw new NotFoundError('CoarseAllocation', id);

    await coarseRepository.deleteById(id);
    await this._invalidateCoarseCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_COARSE_ALLOCATION_CHANGED, {
      allocationId: id,
      action: 'deleted',
      deletedBy,
    }, { source: 'deploy:coarse' });

    auditService.logEvent({
      eventType: 'coarse_allocation.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { allocationId: id },
      module: 'deploy',
    });
  }

  async bulkUpsert(records, userId, meta = {}) {
    const grouped = new Map();
    for (const record of records) {
      const key = `${record.employeeId}:${record.calendarYear}:${record.calendarWeek}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(record);
    }

    for (const [key, group] of grouped.entries()) {
      const [employeeId, calendarYear, calendarWeek] = key.split(':');
      const existing = await coarseRepository.findByEmployeeWeek(
        employeeId,
        Number(calendarYear),
        Number(calendarWeek),
      );
      const finalByProject = new Map(existing.map((allocation) => [
        String(allocation.projectId?._id || allocation.projectId),
        allocation.allocationPercent,
      ]));

      for (const record of group) {
        finalByProject.set(String(record.projectId), record.allocationPercent);
      }

      const finalTotal = [...finalByProject.values()].reduce((sum, value) => sum + value, 0);
      if (finalTotal > 100) {
        throw new ConflictError(
          `Total allocation for employee ${employeeId} in week ${calendarWeek}/${calendarYear} would be ${finalTotal}% (max 100%)`,
        );
      }
    }

    const result = await coarseRepository.bulkUpsert(
      records.map((r) => ({ ...r, createdBy: userId, updatedBy: userId })),
    );
    await this._invalidateCoarseCache();

    auditService.logEvent({
      eventType: 'coarse_allocation.bulk_upsert',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { count: records.length },
      module: 'deploy',
    });

    logger.info('Coarse allocations bulk upserted', {
      module: 'deploy',
      action: 'coarse.bulkUpsert',
      count: records.length,
    });

    return result;
  }

  async _invalidateCoarseCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:coarse:*`);
  }
}

const coarseService = new CoarseService();
export default coarseService;
