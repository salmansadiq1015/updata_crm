import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import conflictRepository from './conflict.repository.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

const ACTIVE_CONFLICTS_TTL = { l1Ttl: 15, l2Ttl: 30 };
const ACTIVE_CONFLICTS_KEY = 'deploy:conflicts:active';
const MIN_TRAVEL_GAP_MINUTES = 60;

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim()).filter(Boolean);
}

function missingCapabilities(required, actual) {
  const actualSet = new Set(normalizeList(actual).map((value) => value.toLowerCase()));
  return normalizeList(required).filter((value) => !actualSet.has(value.toLowerCase()));
}

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
class ConflictService {
  /**
   * Detect all conflicts for a given employee and time window.
   * Returns array of { conflictType, severity, description, conflictingWithId }.
   */
  async detectConflicts(employeeId, start, end, excludeAssignmentId = null, requirements = {}) {
    const conflicts = [];

    const { default: User } = await import('../auth/user.model.js');
    const employee = await User.findById(employeeId)
      .select('status firstName lastName schedulingSkills schedulingCertifications')
      .lean();

    if (!employee || employee.status !== 'active') {
      conflicts.push({
        conflictType: 'INACTIVE_EMPLOYEE',
        severity: 'HARD',
        description: 'Employee is inactive or unavailable for scheduling.',
      });
    }

    const missingRequiredSkills = missingCapabilities(
      requirements.requiredSkills,
      employee?.schedulingSkills,
    );
    const missingRecommendedSkills = missingCapabilities(
      requirements.recommendedSkills,
      employee?.schedulingSkills,
    );
    const missingSkills = [...new Set([...missingRequiredSkills, ...missingRecommendedSkills])];
    if (missingSkills.length > 0) {
      conflicts.push({
        conflictType: 'SKILL_MISMATCH',
        severity: 'SOFT',
        description: `Missing skill match: ${missingSkills.join(', ')}`,
      });
    }

    const missingRequiredCertifications = missingCapabilities(
      requirements.requiredCertifications,
      employee?.schedulingCertifications,
    );
    const missingRecommendedCertifications = missingCapabilities(
      requirements.recommendedCertifications,
      employee?.schedulingCertifications,
    );
    const missingCertifications = [...new Set([
      ...missingRequiredCertifications,
      ...missingRecommendedCertifications,
    ])];
    if (missingCertifications.length > 0) {
      conflicts.push({
        conflictType: 'CERTIFICATION_MISSING',
        severity: 'SOFT',
        description: `Missing certification match: ${missingCertifications.join(', ')}`,
      });
    }

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

    // 2. ABSENCE (HARD) — single range query over the whole span instead of one
    // query per day (the per-day loop was O(days) sequential round-trips, which
    // made multi-day assignments — e.g. Bauplan phases — slow enough to time out).
    const { default: availabilityRepository } = await import('./availability.repository.js');
    const absenceFrom = new Date(start); absenceFrom.setHours(0, 0, 0, 0);
    const absenceTo = new Date(end); absenceTo.setHours(23, 59, 59, 999);
    const absences = await availabilityRepository.findAbsences(employeeId, absenceFrom, absenceTo);
    for (const absence of absences) {
      conflicts.push({
        conflictType: 'ABSENCE',
        severity: 'HARD',
        description: `Employee on ${absence.availabilityType} on ${formatDate(absence.date)}`,
      });
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
    const travelWindowStart = new Date(new Date(start).getTime() - MIN_TRAVEL_GAP_MINUTES * 60 * 1000);
    const travelWindowEnd = new Date(new Date(end).getTime() + MIN_TRAVEL_GAP_MINUTES * 60 * 1000);
    const nearbyAssignments = await assignmentRepository.findByEmployeeAndDateRange(
      employeeId,
      travelWindowStart,
      travelWindowEnd,
    );
    const allAssignments = nearbyAssignments.filter(
      (assignment) => !excludeAssignmentId || String(assignment._id) !== String(excludeAssignmentId),
    );

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

  async checkConflicts(employeeId, start, end, excludeId = null, requirements = {}) {
    const conflicts = await this.detectConflicts(employeeId, start, end, excludeId, requirements);
    return { hasConflicts: conflicts.length > 0, conflicts };
  }

  async recordConflicts(assignmentId, conflicts, resolution = {}) {
    if (!conflicts.length) return [];

    const records = conflicts.map((c) => ({
      assignmentId,
      conflictType: c.conflictType,
      severity: c.severity,
      description: c.description,
      conflictingWithId: c.conflictingWithId || null,
      resolved: resolution.resolved || false,
      overridden: resolution.overridden || false,
      resolvedBy: resolution.resolvedBy || null,
      overrideReason: resolution.overrideReason || null,
    }));

    const created = await conflictRepository.bulkCreate(records);
    await cacheManager.del(ACTIVE_CONFLICTS_KEY);

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
