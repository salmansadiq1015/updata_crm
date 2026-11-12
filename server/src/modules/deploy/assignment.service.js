import assignmentRepository from './assignment.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import calendarCache from './calendarCache.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';
import recurrenceService from './recurrence.service.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const OVERRIDE_REASON_MIN_LENGTH = 10;
const MAX_ASSIGNMENTS_PER_CREATE = 500;

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function uniqueIds(values) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function sameInstant(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function normalizeCapabilityList(values) {
  return Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];
}

class AssignmentService {
  async create(data, createdBy, meta = {}) {
    const {
      employeeIds,
      recurrence,
      appointment,
      overrideConflicts = false,
      overrideReason = null,
      ...assignmentData
    } = data;

    const startDatetime = new Date(assignmentData.startDatetime);
    const endDatetime = new Date(assignmentData.endDatetime);
    this._assertValidDateRange(startDatetime, endDatetime);
    const occurrences = recurrenceService.generateOccurrences(startDatetime, endDatetime, recurrence);
    const assignmentCount = occurrences.length * employeeIds.length;
    if (assignmentCount > MAX_ASSIGNMENTS_PER_CREATE) {
      throw new ValidationError(`Cannot create more than ${MAX_ASSIGNMENTS_PER_CREATE} assignments at once.`);
    }
    const requirements = this._buildRequirements(assignmentData);

    const conflictMap = new Map();
    for (const employeeId of employeeIds) {
      for (const occurrence of occurrences) {
        const conflicts = await this._enforceConflicts({
          employeeId,
          startDatetime: occurrence.startDatetime,
          endDatetime: occurrence.endDatetime,
          overrideConflicts,
          overrideReason,
          requirements,
        });
        conflictMap.set(
          `${normalizeId(employeeId)}:${occurrence.recurrenceIndex}`,
          conflicts,
        );
      }
    }

    let recurrenceGroupId = null;
    if (recurrence) {
      const RecurrencePattern = (await import('./recurrencePattern.model.js')).default;
      const pattern = new RecurrencePattern(recurrence);
      const saved = await pattern.save();
      recurrenceGroupId = saved._id;
    }

    const results = [];
    for (const employeeId of employeeIds) {
      for (const occurrence of occurrences) {
        const assignmentNumber = await counterService.getNextAssignmentNumber();
        const assignment = await assignmentRepository.create({
          ...assignmentData,
          employeeId,
          assignmentNumber,
          recurrenceGroupId,
          recurrenceIndex: occurrence.recurrenceIndex,
          startDatetime: occurrence.startDatetime,
          endDatetime: occurrence.endDatetime,
          createdBy,
        });

        const conflicts = conflictMap.get(`${normalizeId(employeeId)}:${occurrence.recurrenceIndex}`) || [];
        if (conflicts.length > 0) {
          await this._recordOverriddenConflicts(assignment._id, conflicts, createdBy, overrideReason);
        }

        if (assignment.isCustomerAppointment && appointment) {
          await this._syncAppointment(assignment._id, appointment, createdBy, meta);
        }

        results.push({
          id: assignment._id,
          employeeId,
          recurrenceIndex: occurrence.recurrenceIndex,
          status: assignment.status,
          conflicts,
        });

        this._publishAssignmentEvent(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, assignment, {
          createdBy,
          employeeIds: [normalizeId(employeeId)],
          hasAppointment: Boolean(appointment),
          recurrenceGroupId,
          recurrenceIndex: occurrence.recurrenceIndex,
        });
      }
    }

    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    auditService.logEvent({
      eventType: 'assignment.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        employeeIds,
        count: results.length,
        recurrenceCount: occurrences.length,
        overriddenConflicts: results.reduce((count, item) => count + item.conflicts.length, 0),
      },
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

    const {
      employeeIds,
      appointment,
      overrideConflicts = false,
      overrideReason = null,
      ...assignmentData
    } = data;

    delete assignmentData.version;

    if (employeeIds?.length) {
      assignmentData.employeeId = employeeIds[0];
    }

    const changedFields = Object.keys(assignmentData);
    if (changedFields.length === 0) {
      throw new ValidationError('No assignment changes supplied');
    }

    const previousEmployeeId = normalizeId(existing.employeeId);
    const hasEmployeeUpdate = Object.prototype.hasOwnProperty.call(assignmentData, 'employeeId');
    const targetEmployeeId = normalizeId(hasEmployeeUpdate ? assignmentData.employeeId : existing.employeeId);
    const targetStart = assignmentData.startDatetime
      ? new Date(assignmentData.startDatetime)
      : new Date(existing.startDatetime);
    const targetEnd = assignmentData.endDatetime
      ? new Date(assignmentData.endDatetime)
      : new Date(existing.endDatetime);
    this._assertValidDateRange(targetStart, targetEnd);
    const requirements = this._buildRequirements({ ...existing, ...assignmentData });

    const scheduleChanged =
      targetEmployeeId !== previousEmployeeId ||
      !sameInstant(targetStart, existing.startDatetime) ||
      !sameInstant(targetEnd, existing.endDatetime) ||
      this._requirementsChanged(existing, assignmentData);

    let conflicts = [];
    if (scheduleChanged) {
      conflicts = await this._enforceConflicts({
        employeeId: targetEmployeeId,
        startDatetime: targetStart,
        endDatetime: targetEnd,
        excludeAssignmentId: id,
        overrideConflicts,
        overrideReason,
        requirements,
      });
    }

    const updated = await assignmentRepository.updateById(id, {
      ...assignmentData,
      startDatetime: targetStart,
      endDatetime: targetEnd,
      updatedBy,
    });

    if (conflicts.length > 0) {
      await this._recordOverriddenConflicts(id, conflicts, updatedBy, overrideReason);
    }

    if (updated.isCustomerAppointment && appointment) {
      await this._syncAppointment(id, appointment, updatedBy, meta);
    }

    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    this._publishAssignmentEvent(EVENT_TYPES.SCHEDULE_ASSIGNMENT_UPDATED, updated, {
      changedFields,
      updatedBy,
      previousEmployeeId,
      employeeIds: uniqueIds([previousEmployeeId, targetEmployeeId]),
      conflictsOverridden: conflicts.length,
    });

    auditService.logEvent({
      eventType: 'assignment.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        assignmentId: id,
        changedFields,
        conflictsOverridden: conflicts.length,
      },
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

    this._publishAssignmentEvent(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CANCELLED, assignment, {
      deletedBy,
      employeeIds: uniqueIds([assignment.employeeId]),
    });

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

    const previousEmployeeId = normalizeId(existing.employeeId);
    const targetEmployeeId = normalizeId(newEmployeeId || existing.employeeId);
    const targetStart = new Date(newStartDatetime);
    const targetEnd = new Date(newEndDatetime);
    this._assertValidDateRange(targetStart, targetEnd);
    const requirements = this._buildRequirements(existing);

    const conflicts = await this._enforceConflicts({
      employeeId: targetEmployeeId,
      startDatetime: targetStart,
      endDatetime: targetEnd,
      excludeAssignmentId: id,
      overrideConflicts,
      overrideReason,
      requirements,
    });

    const updated = await assignmentRepository.updateById(id, {
      employeeId: targetEmployeeId,
      startDatetime: targetStart,
      endDatetime: targetEnd,
      updatedBy: userId,
    });

    if (conflicts.length > 0) {
      await this._recordOverriddenConflicts(id, conflicts, userId, overrideReason);
    }

    if (updated.isCustomerAppointment && (!sameInstant(targetStart, existing.startDatetime) || !sameInstant(targetEnd, existing.endDatetime))) {
      await this._markAppointmentRescheduled(id, {
        startDatetime: targetStart,
        endDatetime: targetEnd,
      }, userId, meta);
    }

    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    const affectedEmployeeIds = uniqueIds([previousEmployeeId, targetEmployeeId]);
    this._publishAssignmentEvent(EVENT_TYPES.SCHEDULE_ASSIGNMENT_MOVED, updated, {
      previousEmployeeId,
      newEmployeeId: targetEmployeeId,
      newStartDatetime: targetStart,
      newEndDatetime: targetEnd,
      employeeIds: affectedEmployeeIds,
      conflictsOverridden: conflicts.length,
      movedBy: userId,
    });

    auditService.logEvent({
      eventType: 'assignment.moved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        assignmentId: id,
        previousEmployeeId,
        newEmployeeId: targetEmployeeId,
        conflictsOverridden: conflicts.length,
      },
      module: 'deploy',
    });

    return updated;
  }

  async resize(id, { newEndDatetime, overrideConflicts, overrideReason }, userId, meta = {}) {
    const existing = await assignmentRepository.findById(id);
    if (!existing) throw new NotFoundError('Assignment', id);

    const employeeId = normalizeId(existing.employeeId);
    const targetStart = new Date(existing.startDatetime);
    const targetEnd = new Date(newEndDatetime);
    this._assertValidDateRange(targetStart, targetEnd);
    const requirements = this._buildRequirements(existing);

    const conflicts = await this._enforceConflicts({
      employeeId,
      startDatetime: targetStart,
      endDatetime: targetEnd,
      excludeAssignmentId: id,
      overrideConflicts,
      overrideReason,
      requirements,
    });

    const updated = await assignmentRepository.updateById(id, {
      endDatetime: targetEnd,
      updatedBy: userId,
    });

    if (conflicts.length > 0) {
      await this._recordOverriddenConflicts(id, conflicts, userId, overrideReason);
    }

    if (updated.isCustomerAppointment && !sameInstant(targetEnd, existing.endDatetime)) {
      await this._markAppointmentRescheduled(id, {
        startDatetime: targetStart,
        endDatetime: targetEnd,
      }, userId, meta);
    }

    await this._invalidateAssignmentCache(id);
    await this._invalidateCalendarCache();
    await this._invalidateDashboardCache();

    this._publishAssignmentEvent(EVENT_TYPES.SCHEDULE_ASSIGNMENT_UPDATED, updated, {
      changedFields: ['endDatetime'],
      updatedBy: userId,
      employeeIds: [employeeId],
      conflictsOverridden: conflicts.length,
    });

    auditService.logEvent({
      eventType: 'assignment.resized',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, newEndDatetime: targetEnd, conflictsOverridden: conflicts.length },
      module: 'deploy',
    });

    return updated;
  }

  async listByEmployee(employeeId, startDate, endDate, userContext = {}) {
    const now = Date.now();
    const start = startDate ? new Date(startDate) : new Date(now - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date(now + 365 * 24 * 60 * 60 * 1000);
    const targetIds = uniqueIds([
      ...(Array.isArray(userContext.targetIds) ? userContext.targetIds : []),
      userContext.department,
      userContext.preferences?.preferredDepartmentId,
      userContext.preferredDepartmentId,
    ]);
    return assignmentRepository.findVisibleToEmployee(employeeId, start, end, { targetIds });
  }

  async syncSince(employeeId, since) {
    const Assignment = (await import('./assignment.model.js')).default;
    return Assignment.find({
      employeeId,
      updatedAt: { $gt: new Date(since) },
    })
      .setOptions({ includeDeleted: true })
      .lean();
  }

  _assertValidDateRange(startDatetime, endDatetime) {
    if (!(startDatetime instanceof Date) || Number.isNaN(startDatetime.getTime())) {
      throw new ValidationError('Assignment start date is invalid');
    }
    if (!(endDatetime instanceof Date) || Number.isNaN(endDatetime.getTime())) {
      throw new ValidationError('Assignment end date is invalid');
    }
    if (endDatetime <= startDatetime) {
      throw new ValidationError('Assignment end date must be after start date');
    }
  }

  async _enforceConflicts({
    employeeId,
    startDatetime,
    endDatetime,
    excludeAssignmentId = null,
    overrideConflicts = false,
    overrideReason = null,
    requirements = {},
  }) {
    const conflictService = (await import('./conflict.service.js')).default;
    if (!employeeId) return [];

    const conflicts = await conflictService.detectConflicts(
      employeeId,
      startDatetime,
      endDatetime,
      excludeAssignmentId,
      requirements,
    );

    if (conflicts.length === 0) return [];

    const hardConflicts = conflicts.filter((conflict) => conflict.severity === 'HARD');
    if (hardConflicts.length > 0) {
      throw new ConflictError(
        'Assignment has hard scheduling conflicts and cannot be scheduled.',
        { conflicts, hardConflicts },
      );
    }

    if (!overrideConflicts) {
      throw new ConflictError(
        'Assignment has soft scheduling conflicts. Submit overrideConflicts with an overrideReason to proceed.',
        { conflicts },
      );
    }

    if (!overrideReason || overrideReason.trim().length < OVERRIDE_REASON_MIN_LENGTH) {
      throw new ValidationError(
        `Override reason must be at least ${OVERRIDE_REASON_MIN_LENGTH} characters.`,
      );
    }

    return conflicts;
  }

  async _recordOverriddenConflicts(assignmentId, conflicts, userId, overrideReason) {
    const conflictService = (await import('./conflict.service.js')).default;
    // Overridden, not resolved: keep it in the active list so it stays visible
    // and can be reassigned when capacity frees up. resolvedBy stays null until
    // it is actually resolved.
    return conflictService.recordConflicts(assignmentId, conflicts, {
      overridden: true,
      resolved: false,
      overrideReason,
    });
  }

  async _syncAppointment(assignmentId, appointment, userId, meta) {
    const appointmentService = (await import('./appointment.service.js')).default;
    return appointmentService.syncForAssignment(assignmentId, appointment, userId, meta);
  }

  async _markAppointmentRescheduled(assignmentId, scheduleData, userId, meta) {
    const appointmentService = (await import('./appointment.service.js')).default;
    return appointmentService.markAssignmentRescheduled(assignmentId, scheduleData, userId, meta);
  }

  _buildRequirements(source = {}) {
    return {
      requiredSkills: normalizeCapabilityList(source.requiredSkills),
      recommendedSkills: normalizeCapabilityList(source.recommendedSkills),
      requiredCertifications: normalizeCapabilityList(source.requiredCertifications),
      recommendedCertifications: normalizeCapabilityList(source.recommendedCertifications),
    };
  }

  _requirementsChanged(existing, updates = {}) {
    return [
      'requiredSkills',
      'recommendedSkills',
      'requiredCertifications',
      'recommendedCertifications',
    ].some((field) => {
      if (!Object.prototype.hasOwnProperty.call(updates, field)) return false;
      return normalizeCapabilityList(existing[field]).join('|') !== normalizeCapabilityList(updates[field]).join('|');
    });
  }

  _publishAssignmentEvent(eventType, assignment, extra = {}) {
    const { employeeIds, ...eventExtras } = extra;
    const employeeId = normalizeId(assignment.employeeId);
    const payload = {
      assignmentId: assignment._id,
      assignmentNumber: assignment.assignmentNumber,
      employeeId,
      employeeIds: uniqueIds(employeeIds || [employeeId]),
      assignmentType: assignment.assignmentType,
      assignmentTargetType: assignment.assignmentTargetType || 'EMPLOYEE',
      assignmentTargetId: assignment.assignmentTargetId || null,
      assignmentTargetLabel: assignment.assignmentTargetLabel || null,
      title: assignment.title,
      status: assignment.status,
      startDatetime: assignment.startDatetime,
      endDatetime: assignment.endDatetime,
      ...eventExtras,
    };

    eventBus.publish(eventType, payload, { source: 'deploy:assignments' });
  }

  async _invalidateAssignmentCache(id) {
    await cacheManager.del(`deploy:assignment:${id}`);
  }

  // Calendar ranges are cached under a write generation (calendarCache.js) that the
  // Assignment model hooks already bump; the explicit bump keeps call sites honest.
  async _invalidateCalendarCache() {
    await calendarCache.bump();
  }

  async _invalidateDashboardCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);
  }
}

const assignmentService = new AssignmentService();
export default assignmentService;
