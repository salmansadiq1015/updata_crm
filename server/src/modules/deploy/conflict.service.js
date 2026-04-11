import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import conflictRepository from './conflict.repository.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const ACTIVE_CONFLICTS_TTL = { l1Ttl: 15, l2Ttl: 30 };
const ACTIVE_CONFLICTS_KEY = 'deploy:conflicts:active';
const MIN_TRAVEL_GAP_MINUTES = 60;

/**
 * Format a Date to HH:MM string.
 */
function formatTime(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Get all calendar dates covered by a datetime range.
 */
function getDatesBetween(start, end) {
  const dates = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

class ConflictService {
  /**
   * Detect all conflicts for a given employee and time window.
   * Returns array of { conflictType, severity, description, conflictingWithId }.
   */
  async detectConflicts(employeeId, start, end, excludeAssignmentId = null) {
    const conflicts = [];

    // 1. DOUBLE_BOOKING (SOFT)
    const { default: assignmentRepository } = await import('./assignment.repository.js');
    const overlapping = await assignmentRepository.findConflicting(employeeId, start, end, excludeAssignmentId);
    for (const a of overlapping) {
      conflicts.push({
        conflictType: 'DOUBLE_BOOKING',
        severity: 'SOFT',
        description: `Overlaps with '${a.title || a.assignmentNumber}' (${formatTime(a.startDatetime)}-${formatTime(a.endDatetime)})`,
        conflictingWithId: a._id,
      });
    }

    // 2. ABSENCE (HARD)
    const { default: availabilityRepository } = await import('./availability.repository.js');
    const dates = getDatesBetween(start, end);
    for (const date of dates) {
      const absences = await availabilityRepository.findAbsences(employeeId, date, date);
      for (const absence of absences) {
        conflicts.push({
          conflictType: 'ABSENCE',
          severity: 'HARD',
          description: `Employee on ${absence.availabilityType} on ${formatDate(absence.date)}`,
        });
      }
    }

    // 3. WORKING_HOURS (SOFT)
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const availability = await availabilityRepository.isAvailable(employeeId, startDate);
    if (availability && availability.availabilityType === 'WORKING' && availability.workStart && availability.workEnd) {
      const startTime = formatTime(start);
      const endTime = formatTime(end);
      if (startTime < availability.workStart || endTime > availability.workEnd) {
        conflicts.push({
          conflictType: 'WORKING_HOURS',
          severity: 'SOFT',
          description: `Outside working hours (${availability.workStart}-${availability.workEnd})`,
        });
      }
    }

    // 4. TRAVEL_TIME (SOFT)
    const allAssignments = await assignmentRepository.findConflicting(employeeId, new Date(0), new Date('2099-12-31'), excludeAssignmentId);

    // Find assignment ending just before start
    const before = allAssignments
      .filter((a) => new Date(a.endDatetime) <= new Date(start))
      .sort((a, b) => new Date(b.endDatetime) - new Date(a.endDatetime))[0];

    if (before) {
      const gapMinutes = (new Date(start) - new Date(before.endDatetime)) / (1000 * 60);
      if (gapMinutes < MIN_TRAVEL_GAP_MINUTES) {
        conflicts.push({
          conflictType: 'TRAVEL_TIME',
          severity: 'SOFT',
          description: `Only ${Math.round(gapMinutes)}min gap (minimum: ${MIN_TRAVEL_GAP_MINUTES}min)`,
          conflictingWithId: before._id,
        });
      }
    }

    // Find assignment starting just after end
    const after = allAssignments
      .filter((a) => new Date(a.startDatetime) >= new Date(end))
      .sort((a, b) => new Date(a.startDatetime) - new Date(b.startDatetime))[0];

    if (after) {
      const gapMinutes = (new Date(after.startDatetime) - new Date(end)) / (1000 * 60);
      if (gapMinutes < MIN_TRAVEL_GAP_MINUTES) {
        conflicts.push({
          conflictType: 'TRAVEL_TIME',
          severity: 'SOFT',
          description: `Only ${Math.round(gapMinutes)}min gap (minimum: ${MIN_TRAVEL_GAP_MINUTES}min)`,
          conflictingWithId: after._id,
        });
      }
    }

    return conflicts;
  }

  async checkConflicts(employeeId, start, end, excludeId = null) {
    const conflicts = await this.detectConflicts(employeeId, start, end, excludeId);
    return { hasConflicts: conflicts.length > 0, conflicts };
  }

  async recordConflicts(assignmentId, conflicts) {
    const records = conflicts.map((c) => ({
      assignmentId,
      conflictType: c.conflictType,
      severity: c.severity,
      description: c.description,
      conflictingWithId: c.conflictingWithId || null,
    }));

    const created = await conflictRepository.bulkCreate(records);

    for (const record of created) {
      eventBus.publish(EVENT_TYPES.SCHEDULE_CONFLICT_DETECTED, {
        conflictId: record._id,
        assignmentId,
        conflictType: record.conflictType,
        severity: record.severity,
      }, { source: 'deploy:conflicts' });
    }

    return created;
  }

  async listActive() {
    return cacheManager.getOrSet(
      ACTIVE_CONFLICTS_KEY,
      () => conflictRepository.findActive(),
      ACTIVE_CONFLICTS_TTL,
    );
  }

  async resolve(id, overrideReason, userId, meta = {}) {
    const existing = await conflictRepository.findById(id);
    if (!existing) throw new NotFoundError('ConflictRecord', id);

    if (existing.resolved) {
      throw new ConflictError('Conflict has already been resolved');
    }

    const resolved = await conflictRepository.resolve(id, {
      resolvedBy: userId,
      overrideReason,
    });

    await cacheManager.del(ACTIVE_CONFLICTS_KEY);

    auditService.logEvent({
      eventType: 'conflict.resolved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { conflictId: id, overrideReason },
      module: 'deploy',
    });

    logger.info('Conflict resolved', { module: 'deploy', action: 'resolve', conflictId: id });

    return resolved;
  }

  hasHardConflicts(conflicts) {
    return conflicts.some((c) => c.severity === 'HARD');
  }
}

const conflictService = new ConflictService();
export default conflictService;
