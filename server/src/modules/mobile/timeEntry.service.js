import timeEntryRepository from './timeEntry.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import { emitTimeTrackingRealtimeEvent } from '../../shared/socket/socketServer.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class TimeEntryService {
  _calculateNetDuration(startTime, endTime, breakDurationMin) {
    if (!startTime || !endTime) return null;
    const totalMin = (new Date(endTime) - new Date(startTime)) / 60000;
    return totalMin - (breakDurationMin || 0);
  }

  async listByOrder(orderId) {
    return timeEntryRepository.findByOrderId(orderId);
  }

  /**
   * `orderId` is null for office hours — the entry then carries entryType
   * OFFICE and, optionally, a category. Everything downstream (cache key,
   * events, audit) tolerates its absence.
   */
  /**
   * The company break, applied only once the span reaches the configured
   * threshold — a two-hour morning should not lose a lunch break.
   */
  async _defaultBreakFor(startTime, endTime) {
    if (!endTime) return 0;
    const WorkTimeSettings = (await import('./workTimeSettings.model.js')).default;
    const settings = await WorkTimeSettings.findOne({ key: 'default' }).lean();
    if (!settings) return 0;
    const spanHours = (new Date(endTime) - new Date(startTime)) / 3600000;
    return spanHours >= (settings.breakThresholdHours ?? 6) ? (settings.breakDurationMin ?? 0) : 0;
  }

  async create(orderId, data, technicianId, meta = {}) {
    const entryType = orderId ? 'ASSIGNMENT' : 'OFFICE';
    const breakDurationMin = entryType === 'OFFICE' && data.breakDurationMin === undefined
      ? await this._defaultBreakFor(data.startTime, data.endTime)
      : (data.breakDurationMin || 0);
    const netDurationMin = this._calculateNetDuration(data.startTime, data.endTime, breakDurationMin);

    const entry = await timeEntryRepository.create({
      ...data,
      breakDurationMin,
      orderId: orderId || null,
      entryType,
      technicianId,
      netDurationMin,
      createdBy: technicianId,
    });

    eventBus.publish(EVENT_TYPES.MOBILE_TIME_ENTRY_CREATED, {
      entryId: entry._id,
      orderId,
      technicianId,
    }, { source: 'mobile:time-entries' });
    emitTimeTrackingRealtimeEvent({ type: 'time-entry.created', entryId: entry._id, orderId, technicianId });

    auditService.logEvent({
      eventType: 'time-entry.created',
      userId: technicianId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: entry._id, orderId },
      module: 'mobile',
    });

    logger.info('Time entry created', { module: 'mobile', action: 'create', entryId: entry._id, orderId });

    return entry;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await timeEntryRepository.findById(id);
    if (!existing) throw new NotFoundError('TimeEntry', id);

    if (existing.releaseStatus === 'RELEASED') {
      throw new ConflictError('Released time entries cannot be modified.');
    }

    const startTime = data.startTime || existing.startTime;
    const endTime = data.endTime !== undefined ? data.endTime : existing.endTime;
    const breakDurationMin = data.breakDurationMin !== undefined ? data.breakDurationMin : existing.breakDurationMin;
    const netDurationMin = this._calculateNetDuration(startTime, endTime, breakDurationMin);

    const updated = await timeEntryRepository.updateById(id, {
      ...data,
      netDurationMin,
      updatedBy: userId,
    });

    if (existing.orderId) await cacheManager.del(`mobile:time-entries:order:${existing.orderId}`);

    auditService.logEvent({
      eventType: 'time-entry.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: id, changedFields: Object.keys(data) },
      module: 'mobile',
    });

    return updated;
  }

  async delete(id, userId, meta = {}) {
    const existing = await timeEntryRepository.findById(id);
    if (!existing) throw new NotFoundError('TimeEntry', id);

    if (existing.releaseStatus === 'RELEASED') {
      throw new ConflictError('Released time entries cannot be modified.');
    }

    await timeEntryRepository.softDelete(id);

    if (existing.orderId) await cacheManager.del(`mobile:time-entries:order:${existing.orderId}`);
    emitTimeTrackingRealtimeEvent({ type: 'time-entry.deleted', entryId: id, orderId: existing.orderId, technicianId: existing.technicianId });

    auditService.logEvent({
      eventType: 'time-entry.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: id, orderId: existing.orderId },
      module: 'mobile',
    });
  }

  async listByDateRange(technicianId, dateFrom, dateTo) {
    return timeEntryRepository.findByTechnicianAndDateRange(technicianId, dateFrom, dateTo);
  }

  async list(filters = {}) {
    return timeEntryRepository.list(filters);
  }

  async release(id, userId, meta = {}) {
    const existing = await timeEntryRepository.findById(id);
    if (!existing) throw new NotFoundError('TimeEntry', id);

    // Check that a submitted work report exists for this order
    const WorkReport = (await import('./workReport.model.js')).default;
    const submittedReport = await WorkReport.findOne({
      orderId: existing.orderId,
      status: 'SUBMITTED',
      isDeleted: false,
    }).lean();

    if (!submittedReport) {
      return {
        released: false,
        reason: 'WORK_REPORT_NOT_SUBMITTED',
        message: 'Cannot release time entry without a submitted work report for this order.',
        orderId: existing.orderId,
        reportStatus: null,
      };
    }

    await timeEntryRepository.updateById(id, {
      releaseStatus: 'RELEASED',
      updatedBy: userId,
    });

    eventBus.publish(EVENT_TYPES.MOBILE_TIME_ENTRY_RELEASED, {
      entryId: id,
      orderId: existing.orderId,
      technicianId: existing.technicianId,
    }, { source: 'mobile:time-entries' });
    emitTimeTrackingRealtimeEvent({ type: 'time-entry.released', entryId: id, orderId: existing.orderId, technicianId: existing.technicianId });

    auditService.logEvent({
      eventType: 'time-entry.released',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: id, orderId: existing.orderId },
      module: 'mobile',
    });

    return { released: true };
  }

  async override(id, justification, userId, meta = {}) {
    const existing = await timeEntryRepository.findById(id);
    if (!existing) throw new NotFoundError('TimeEntry', id);

    if (!justification || justification.trim().length < 20) {
      throw new ConflictError('A justification with at least 20 characters is required to override time release.');
    }

    const updated = await timeEntryRepository.updateById(id, {
      releaseStatus: 'RELEASED',
      overrideJustification: justification.trim(),
      overriddenBy: userId,
      overriddenAt: new Date(),
      updatedBy: userId,
    });

    if (existing.orderId) await cacheManager.del(`mobile:time-entries:order:${existing.orderId}`);
    emitTimeTrackingRealtimeEvent({ type: 'time-entry.updated', entryId: id, orderId: existing.orderId, technicianId: existing.technicianId });

    eventBus.publish(EVENT_TYPES.MOBILE_TIME_ENTRY_RELEASED, {
      entryId: id,
      orderId: existing.orderId,
      technicianId: existing.technicianId,
      overridden: true,
    }, { source: 'mobile:time-entries' });
    emitTimeTrackingRealtimeEvent({ type: 'time-entry.override_released', entryId: id, orderId: existing.orderId, technicianId: existing.technicianId });

    auditService.logEvent({
      eventType: 'time-entry.override_released',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { entryId: id, orderId: existing.orderId, justification: justification.trim() },
      module: 'mobile',
    });

    return { released: true, overridden: true, entry: updated };
  }

  async autoReleaseByOrderId(orderId) {
    const count = await timeEntryRepository.releaseByOrderId(orderId);
    return count;
  }
}

const timeEntryService = new TimeEntryService();
export default timeEntryService;
