import coarseRepository from './coarse.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const COARSE_TTL = { l1Ttl: 60, l2Ttl: 300 };

// ISO-8601 calendar week + week-year for a date.
function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const calendarYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(calendarYear, 0, 1));
  const calendarWeek = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { calendarYear, calendarWeek };
}

// Monday (local, 00:00) of ISO week `week` in `year`.
function isoWeekMonday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - jan4Dow + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

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
      async () => {
        const [allocations, assignmentLoads] = await Promise.all([
          coarseRepository.findByWeekRange(year, weekFrom, weekTo, { employeeIds, projectId }),
          this._computeAssignmentLoads(year, weekFrom, weekTo, { employeeIds }),
        ]);
        return { allocations, assignmentLoads };
      },
      COARSE_TTL,
    );
  }

  // Weekly load (%) each employee carries from actual assignments (Einsätze) in
  // the visible range — so the Grobplanung capacity reflects real bookings, not
  // just coarse allocations. Load = share of the week's working days (Mon–Fri)
  // that the employee has at least one assignment on.
  async _computeAssignmentLoads(year, weekFrom, weekTo, { employeeIds } = {}) {
    const rangeStart = isoWeekMonday(year, weekFrom);
    const rangeEnd = isoWeekMonday(year, weekTo);
    rangeEnd.setDate(rangeEnd.getDate() + 7); // exclusive end = Monday after weekTo

    const { default: assignmentRepository } = await import('./assignment.repository.js');
    const assignments = await assignmentRepository.findByDateRange(rangeStart, rangeEnd, { employeeIds });

    const coverage = new Map(); // `${empId}:${year}:${week}` -> Set(dayKey)
    for (const a of assignments) {
      const empId = String(a.employeeId?._id || a.employeeId || '');
      if (!empId || empId === 'null' || empId === 'undefined') continue;

      const cursor = new Date(Math.max(new Date(a.startDatetime).getTime(), rangeStart.getTime()));
      cursor.setHours(12, 0, 0, 0);
      const end = new Date(Math.min(new Date(a.endDatetime).getTime(), rangeEnd.getTime()));
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) {
          const { calendarYear, calendarWeek } = isoWeekOf(cursor);
          if (calendarYear === year && calendarWeek >= weekFrom && calendarWeek <= weekTo) {
            const key = `${empId}:${calendarYear}:${calendarWeek}`;
            if (!coverage.has(key)) coverage.set(key, new Set());
            coverage.get(key).add(cursor.toISOString().slice(0, 10));
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return Array.from(coverage.entries()).map(([key, days]) => {
      const [employeeId, calendarYear, calendarWeek] = key.split(':');
      return {
        employeeId,
        calendarYear: Number(calendarYear),
        calendarWeek: Number(calendarWeek),
        percent: Math.min(100, Math.round((days.size / 5) * 100)),
      };
    });
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

  async move(id, targetYear, targetWeek, movedBy, meta = {}) {
    const existing = await coarseRepository.findById(id);
    if (!existing) throw new NotFoundError('CoarseAllocation', id);

    const employeeId = existing.employeeId?._id || existing.employeeId;
    const projectId = existing.projectId?._id || existing.projectId;

    // No-op if target is the same week
    if (existing.calendarYear === targetYear && existing.calendarWeek === targetWeek) {
      return existing;
    }

    // Check for duplicate at target
    const duplicate = await coarseRepository.findByEmployeeProjectWeek(
      employeeId, projectId, targetYear, targetWeek,
    );
    if (duplicate) {
      throw new ConflictError('Coarse allocation already exists for this employee, project, and week.');
    }

    // Capacity check at target week (exclude nothing — the source will be deleted)
    const currentSum = await coarseRepository.sumAllocationsForEmployeeWeek(
      employeeId, targetYear, targetWeek,
    );
    if (currentSum + existing.allocationPercent > 100) {
      throw new ConflictError(
        `Total allocation would be ${currentSum + existing.allocationPercent}% (max 100%)`,
      );
    }

    // Delete source and create at target
    await coarseRepository.deleteById(id);
    const allocation = await coarseRepository.create({
      employeeId,
      projectId,
      calendarYear: targetYear,
      calendarWeek: targetWeek,
      allocationPercent: existing.allocationPercent,
      notes: existing.notes,
      createdBy: movedBy,
    });
    await this._invalidateCoarseCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_COARSE_ALLOCATION_CHANGED, {
      allocationId: allocation._id,
      previousAllocationId: id,
      employeeId,
      projectId,
      calendarYear: targetYear,
      calendarWeek: targetWeek,
      action: 'moved',
      movedBy,
    }, { source: 'deploy:coarse' });

    auditService.logEvent({
      eventType: 'coarse_allocation.moved',
      userId: movedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        previousAllocationId: id,
        newAllocationId: allocation._id,
        from: { year: existing.calendarYear, week: existing.calendarWeek },
        to: { year: targetYear, week: targetWeek },
      },
      module: 'deploy',
    });

    logger.info('Coarse allocation moved', {
      module: 'deploy',
      action: 'coarse.move',
      previousAllocationId: id,
      newAllocationId: allocation._id,
    });

    return coarseRepository.findById(allocation._id);
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
