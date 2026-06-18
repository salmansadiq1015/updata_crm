import scheduledNotificationRepository from './scheduledNotification.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 30, l2Ttl: 120 };
const LIST_TTL = { l1Ttl: 15, l2Ttl: 60 };

class ScheduledNotificationService {
  async create(data, userId, meta = {}) {
    if (data.scheduleType === 'ONE_TIME') {
      if (!data.scheduledAt) {
        throw new AppError('scheduledAt is required for ONE_TIME schedules', 400, ERROR_CODES.VALIDATION_ERROR);
      }
      if (new Date(data.scheduledAt) <= new Date()) {
        throw new AppError('scheduledAt must be in the future', 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (data.scheduleType === 'RECURRING' && !data.cronExpression) {
      throw new AppError('cronExpression is required for RECURRING schedules', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const nextDispatchAt = data.scheduleType === 'ONE_TIME'
      ? new Date(data.scheduledAt)
      : this._computeNextDispatch(data.cronExpression, data.timezone || 'Europe/Zurich');

    const scheduled = await scheduledNotificationRepository.create({
      ...data,
      nextDispatchAt,
      status: 'ACTIVE',
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'scheduled_notification.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        scheduledId: scheduled._id,
        notificationType: scheduled.notificationType,
        scheduleType: scheduled.scheduleType,
        nextDispatchAt,
      },
      module: 'notifications',
    });

    logger.info('Scheduled notification created', {
      module: 'notifications',
      action: 'createScheduled',
      scheduledId: scheduled._id,
      scheduleType: scheduled.scheduleType,
      nextDispatchAt,
      userId,
    });

    return scheduled;
  }

  async getById(id) {
    const cacheKey = `notif:scheduled:${id}`;

    const scheduled = await cacheManager.getOrSet(
      cacheKey,
      () => scheduledNotificationRepository.findById(id),
      ENTITY_TTL,
    );

    if (!scheduled) throw new NotFoundError('ScheduledNotification', id);

    return scheduled;
  }

  async list(queryParams = {}) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `notif:scheduled:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => scheduledNotificationRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      LIST_TTL,
    );
  }

  async update(id, data, userId, meta = {}) {
    const existing = await scheduledNotificationRepository.findById(id);
    if (!existing) throw new NotFoundError('ScheduledNotification', id);

    const updateData = { ...data, updatedBy: userId };

    // Recompute nextDispatchAt if schedule parameters changed
    if (data.scheduledAt || data.cronExpression || data.timezone) {
      const scheduleType = data.scheduleType || existing.scheduleType;
      const cronExpression = data.cronExpression || existing.cronExpression;
      const timezone = data.timezone || existing.timezone || 'Europe/Zurich';

      if (scheduleType === 'ONE_TIME') {
        const scheduledAt = data.scheduledAt || existing.scheduledAt;
        if (new Date(scheduledAt) <= new Date()) {
          throw new AppError('scheduledAt must be in the future', 400, ERROR_CODES.VALIDATION_ERROR);
        }
        updateData.nextDispatchAt = new Date(scheduledAt);
      } else {
        updateData.nextDispatchAt = this._computeNextDispatch(cronExpression, timezone);
      }
    }

    const updated = await scheduledNotificationRepository.updateById(id, updateData);

    await cacheManager.del(`notif:scheduled:${id}`);

    auditService.logEvent({
      eventType: 'scheduled_notification.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { scheduledId: id, changedFields: Object.keys(data) },
      module: 'notifications',
    });

    logger.info('Scheduled notification updated', {
      module: 'notifications',
      action: 'updateScheduled',
      scheduledId: id,
      userId,
    });

    return updated;
  }

  async remove(id, userId, meta = {}) {
    const existing = await scheduledNotificationRepository.findById(id);
    if (!existing) throw new NotFoundError('ScheduledNotification', id);

    await scheduledNotificationRepository.softDelete(id);

    await cacheManager.del(`notif:scheduled:${id}`);

    auditService.logEvent({
      eventType: 'scheduled_notification.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { scheduledId: id, notificationType: existing.notificationType },
      module: 'notifications',
    });

    logger.info('Scheduled notification deleted', {
      module: 'notifications',
      action: 'removeScheduled',
      scheduledId: id,
      userId,
    });

    return { deleted: true };
  }

  async cancel(id, userId, meta = {}) {
    const existing = await scheduledNotificationRepository.findById(id);
    if (!existing) throw new NotFoundError('ScheduledNotification', id);

    const updated = await scheduledNotificationRepository.updateById(id, {
      status: 'CANCELLED',
    });

    await cacheManager.del(`notif:scheduled:${id}`);

    auditService.logEvent({
      eventType: 'scheduled_notification.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { scheduledId: id },
      module: 'notifications',
    });

    logger.info('Scheduled notification cancelled', {
      module: 'notifications',
      action: 'cancelScheduled',
      scheduledId: id,
      userId,
    });

    return updated;
  }

  async pause(id, userId, meta = {}) {
    const existing = await scheduledNotificationRepository.findById(id);
    if (!existing) throw new NotFoundError('ScheduledNotification', id);

    if (existing.status !== 'ACTIVE') {
      throw new AppError(
        'Only ACTIVE schedules can be paused',
        400,
        ERROR_CODES.NOTIF_SCHEDULED_INVALID_STATUS,
      );
    }

    const updated = await scheduledNotificationRepository.updateById(id, {
      status: 'PAUSED',
    });

    await cacheManager.del(`notif:scheduled:${id}`);

    auditService.logEvent({
      eventType: 'scheduled_notification.paused',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { scheduledId: id },
      module: 'notifications',
    });

    logger.info('Scheduled notification paused', {
      module: 'notifications',
      action: 'pauseScheduled',
      scheduledId: id,
      userId,
    });

    return updated;
  }

  async resume(id, userId, meta = {}) {
    const existing = await scheduledNotificationRepository.findById(id);
    if (!existing) throw new NotFoundError('ScheduledNotification', id);

    if (existing.status !== 'PAUSED') {
      throw new AppError(
        'Only PAUSED schedules can be resumed',
        400,
        ERROR_CODES.NOTIF_SCHEDULED_INVALID_STATUS,
      );
    }

    let nextDispatchAt;
    if (existing.scheduleType === 'ONE_TIME') {
      nextDispatchAt = existing.scheduledAt ? new Date(existing.scheduledAt) : new Date();
    } else {
      nextDispatchAt = this._computeNextDispatch(
        existing.cronExpression,
        existing.timezone || 'Europe/Zurich',
      );
    }

    const updated = await scheduledNotificationRepository.updateById(id, {
      status: 'ACTIVE',
      nextDispatchAt,
    });

    await cacheManager.del(`notif:scheduled:${id}`);

    auditService.logEvent({
      eventType: 'scheduled_notification.resumed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { scheduledId: id, nextDispatchAt },
      module: 'notifications',
    });

    logger.info('Scheduled notification resumed', {
      module: 'notifications',
      action: 'resumeScheduled',
      scheduledId: id,
      nextDispatchAt,
      userId,
    });

    return updated;
  }

  async processDueSchedules() {
    const now = new Date();
    const dueSchedules = await scheduledNotificationRepository.findDue(now);

    if (dueSchedules.length === 0) return { processed: 0 };

    const notificationService = (await import('./notification.service.js')).default;
    let processed = 0;

    for (const schedule of dueSchedules) {
      try {
        // Create the notification
        await notificationService.create(
          {
            type: schedule.notificationType,
            category: schedule.category || 'SYSTEM',
            priority: schedule.priority || 'NORMAL',
            channels: schedule.channels || [],
            recipientIds: schedule.recipientIds || [],
            payload: schedule.payload || {},
            sourceModule: schedule.sourceModule,
            sourceEntityType: schedule.sourceEntityType,
            sourceEntityId: schedule.sourceEntityId,
          },
          schedule.createdBy,
          { ipAddress: 'scheduler' },
        );

        const updateData = { lastDispatchedAt: now };

        if (schedule.scheduleType === 'ONE_TIME') {
          updateData.status = 'COMPLETED';
          updateData.nextDispatchAt = null;
        } else {
          // Compute next dispatch for recurring
          const nextDispatchAt = this._computeNextDispatch(
            schedule.cronExpression,
            schedule.timezone || 'Europe/Zurich',
          );

          // Check if endDate is set and next dispatch exceeds it
          if (schedule.endDate && nextDispatchAt > new Date(schedule.endDate)) {
            updateData.status = 'COMPLETED';
            updateData.nextDispatchAt = null;
          } else {
            updateData.nextDispatchAt = nextDispatchAt;
          }
        }

        await scheduledNotificationRepository.updateById(schedule._id, updateData);
        await cacheManager.del(`notif:scheduled:${schedule._id}`);

        processed++;

        logger.info('Scheduled notification dispatched', {
          module: 'notifications',
          action: 'processDueSchedules',
          scheduledId: schedule._id,
          scheduleType: schedule.scheduleType,
          notificationType: schedule.notificationType,
        });
      } catch (err) {
        logger.error('Failed to dispatch scheduled notification', {
          module: 'notifications',
          action: 'processDueSchedules',
          scheduledId: schedule._id,
          error: err.message,
        });
      }
    }

    logger.info('Due schedules processing completed', {
      module: 'notifications',
      action: 'processDueSchedules',
      total: dueSchedules.length,
      processed,
    });

    return { processed, total: dueSchedules.length };
  }

  _computeNextDispatch(cronExpression, timezone = 'Europe/Zurich') {
    // Parse a standard 5-field cron expression: minute hour dayOfMonth month dayOfWeek
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) {
      throw new AppError('Invalid cron expression', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;

    const now = new Date();
    // Compute in UTC then adjust; for simplicity we iterate forward up to 366 days
    const maxIterations = 366 * 24 * 60;
    const candidate = new Date(now.getTime() + 60000); // Start from next minute

    // Zero out seconds/ms
    candidate.setSeconds(0, 0);

    for (let i = 0; i < maxIterations; i++) {
      const localString = candidate.toLocaleString('en-US', { timeZone: timezone });
      const local = new Date(localString);

      const min = local.getMinutes();
      const hr = local.getHours();
      const dom = local.getDate();
      const mon = local.getMonth() + 1;
      const dow = local.getDay(); // 0=Sunday

      if (
        this._cronFieldMatches(minutePart, min, 0, 59)
        && this._cronFieldMatches(hourPart, hr, 0, 23)
        && this._cronFieldMatches(dayOfMonthPart, dom, 1, 31)
        && this._cronFieldMatches(monthPart, mon, 1, 12)
        && this._cronFieldMatches(dayOfWeekPart, dow, 0, 6)
      ) {
        return candidate;
      }

      candidate.setTime(candidate.getTime() + 60000); // Advance one minute
    }

    // Fallback: 24 hours from now
    logger.warn('Could not compute next dispatch from cron, defaulting to 24h', {
      module: 'notifications',
      action: '_computeNextDispatch',
      cronExpression,
    });
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  _cronFieldMatches(field, value, min, max) {
    const isWithinBounds = (candidate) => Number.isInteger(candidate) && candidate >= min && candidate <= max;

    if (field === '*') return true;

    // Handle step values: */5
    if (field.startsWith('*/')) {
      const step = parseInt(field.substring(2), 10);
      return Number.isInteger(step) && step > 0 && value >= min && value <= max && value % step === 0;
    }

    // Handle ranges: 1-5
    if (field.includes('-') && !field.includes(',')) {
      const [start, end] = field.split('-').map(Number);
      return isWithinBounds(start) && isWithinBounds(end) && start <= end && value >= start && value <= end;
    }

    // Handle lists: 1,3,5
    if (field.includes(',')) {
      const values = field.split(',');
      return values.some((v) => {
        if (v.includes('-')) {
          const [start, end] = v.split('-').map(Number);
          return isWithinBounds(start) && isWithinBounds(end) && start <= end && value >= start && value <= end;
        }
        const exact = parseInt(v, 10);
        return isWithinBounds(exact) && exact === value;
      });
    }

    // Exact match
    const exact = parseInt(field, 10);
    return isWithinBounds(exact) && exact === value;
  }
}

const scheduledNotificationService = new ScheduledNotificationService();
export default scheduledNotificationService;
