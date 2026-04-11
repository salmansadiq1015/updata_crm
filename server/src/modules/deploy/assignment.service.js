import assignmentRepository from './assignment.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const CALENDAR_TTL = { l1Ttl: 15, l2Ttl: 60 };

class AssignmentService {
  async create(data, createdBy, meta = {}) {
    const { employeeIds, recurrence, ...assignmentData } = data;
    const results = [];

    let recurrenceGroupId = null;
    if (recurrence) {
      const RecurrencePattern = (await import('./recurrencePattern.model.js')).default;
      const pattern = new RecurrencePattern(recurrence);
      const saved = await pattern.save();
      recurrenceGroupId = saved._id;
    }

    for (const employeeId of employeeIds) {
      const assignmentNumber = await counterService.getNextAssignmentNumber();

      const assignment = await assignmentRepository.create({
        ...assignmentData,
        employeeId,
        assignmentNumber,
        recurrenceGroupId,
        createdBy,
      });

      // Detect conflicts (lazy import to avoid circular dependencies)
      let conflicts = [];
      try {
        const conflictService = (await import('./conflict.service.js')).default;
        conflicts = await conflictService.detectConflicts(
          employeeId,
          assignment.startDatetime,
          assignment.endDatetime,
          assignment._id,
        );
      } catch {
        // conflict.service.js may not exist yet — skip detection
      }

      results.push({
        id: assignment._id,
        employeeId,
        status: assignment.status,
        conflicts,
      });

      eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, {
        assignmentId: assignment._id,
        assignmentNumber,
        employeeId,
        assignmentType: assignment.assignmentType,
        createdBy,
      }, { source: 'deploy:assignments' });
    }

    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    auditService.logEvent({
      eventType: 'assignment.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { employeeIds, count: results.length },
      module: 'deploy',
    });

    logger.info('Assignment(s) created', { module: 'deploy', action: 'create', count: results.length });

    return results;
  }

  async getById(id) {
    const cacheKey = `deploy:assignment:${id}`;
    const assignment = await cacheManager.getOrSet(
      cacheKey,
      () => assignmentRepository.findById(id),
      ENTITY_TTL,
    );
    if (!assignment) throw new NotFoundError('Assignment', id);
    return assignment;
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await assignmentRepository.findById(id);
    if (!existing) throw new NotFoundError('Assignment', id);

    if (data.version !== undefined && data.version !== existing.version) {
      throw new ConflictError(
        'Assignment has been modified by another user. Please refresh and try again.',
      );
    }

    const updated = await assignmentRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_UPDATED, {
      assignmentId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'deploy:assignments' });

    auditService.logEvent({
      eventType: 'assignment.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, changedFields: Object.keys(data) },
      module: 'deploy',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const assignment = await assignmentRepository.findById(id);
    if (!assignment) throw new NotFoundError('Assignment', id);

    await assignmentRepository.softDelete(id);
    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CANCELLED, {
      assignmentId: id,
      deletedBy,
    }, { source: 'deploy:assignments' });

    auditService.logEvent({
      eventType: 'assignment.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, assignmentNumber: assignment.assignmentNumber },
      module: 'deploy',
    });
  }

  async move(id, { newEmployeeId, newStartDatetime, newEndDatetime, overrideConflicts, overrideReason }, userId, meta = {}) {
    const existing = await assignmentRepository.findById(id);
    if (!existing) throw new NotFoundError('Assignment', id);

    // Detect conflicts for new position
    const conflicts = await assignmentRepository.findConflicting(
      newEmployeeId,
      new Date(newStartDatetime),
      new Date(newEndDatetime),
      id,
    );

    if (conflicts.length > 0 && !overrideConflicts) {
      throw new ConflictError(
        `Assignment conflicts with ${conflicts.length} existing assignment(s). Use overrideConflicts to proceed.`,
      );
    }

    const updateData = {
      employeeId: newEmployeeId,
      startDatetime: new Date(newStartDatetime),
      endDatetime: new Date(newEndDatetime),
      updatedBy: userId,
    };

    const updated = await assignmentRepository.updateById(id, updateData);

    // If conflicts exist and override was used, create ConflictRecords
    if (conflicts.length > 0) {
      try {
        const conflictService = (await import('./conflict.service.js')).default;
        for (const conflict of conflicts) {
          await conflictService.createConflictRecord({
            assignmentId: id,
            conflictingAssignmentId: conflict._id,
            employeeId: newEmployeeId,
            overrideReason,
            overriddenBy: userId,
          });
        }
      } catch {
        // conflict.service.js may not exist yet
      }
    }

    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();

    eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_MOVED, {
      assignmentId: id,
      newEmployeeId,
      newStartDatetime,
      newEndDatetime,
      conflictsOverridden: conflicts.length,
      movedBy: userId,
    }, { source: 'deploy:assignments' });

    auditService.logEvent({
      eventType: 'assignment.moved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, newEmployeeId, conflictsOverridden: conflicts.length },
      module: 'deploy',
    });

    return updated;
  }

  async resize(id, { newEndDatetime, overrideConflicts, overrideReason }, userId, meta = {}) {
    const existing = await assignmentRepository.findById(id);
    if (!existing) throw new NotFoundError('Assignment', id);

    // Detect conflicts for resized range
    const conflicts = await assignmentRepository.findConflicting(
      existing.employeeId._id || existing.employeeId,
      existing.startDatetime,
      new Date(newEndDatetime),
      id,
    );

    if (conflicts.length > 0 && !overrideConflicts) {
      throw new ConflictError(
        `Resize conflicts with ${conflicts.length} existing assignment(s). Use overrideConflicts to proceed.`,
      );
    }

    const updateData = {
      endDatetime: new Date(newEndDatetime),
      updatedBy: userId,
    };

    const updated = await assignmentRepository.updateById(id, updateData);

    // If conflicts exist and override was used, create ConflictRecords
    if (conflicts.length > 0) {
      try {
        const conflictService = (await import('./conflict.service.js')).default;
        for (const conflict of conflicts) {
          await conflictService.createConflictRecord({
            assignmentId: id,
            conflictingAssignmentId: conflict._id,
            employeeId: existing.employeeId._id || existing.employeeId,
            overrideReason,
            overriddenBy: userId,
          });
        }
      } catch {
        // conflict.service.js may not exist yet
      }
    }

    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();

    auditService.logEvent({
      eventType: 'assignment.resized',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, newEndDatetime, conflictsOverridden: conflicts.length },
      module: 'deploy',
    });

    return updated;
  }

  async listByEmployee(employeeId, startDate, endDate) {
    return assignmentRepository.findByEmployeeAndDateRange(employeeId, new Date(startDate), new Date(endDate));
  }

  async syncSince(employeeId, since) {
    const Assignment = (await import('./assignment.model.js')).default;
    return Assignment.find({
      employeeId,
      updatedAt: { $gt: new Date(since) },
    }).lean();
  }

  async _invalidateAssignmentCache(id) {
    await cacheManager.del(`deploy:assignment:${id}`);
  }

  async _invalidateCalendarCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);
  }

  async _invalidateDashboardCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);
  }
}

const assignmentService = new AssignmentService();
export default assignmentService;
