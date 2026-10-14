import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function cleanOperationalError(value) {
  if (!value) return null;
  return String(value)
    .replace(/bearer\s+[a-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

export function buildIntegrationStatusNotification(payload, adminIds) {
  const newStatus = payload.newStatus || payload.currentStatus;
  const oldStatus = payload.oldStatus || payload.previousStatus || 'unknown';
  if (!['healthy', 'degraded', 'down'].includes(newStatus)) return null;
  if (newStatus === 'healthy' && !['degraded', 'down'].includes(oldStatus)) return null;
  const displayName = payload.displayName || payload.integrationKey || 'Integration';
  const recovered = newStatus === 'healthy';
  const checkedAt = new Date(payload.checkedAt || Date.now());
  const transitionAt = Number.isNaN(checkedAt.getTime()) ? new Date().toISOString() : checkedAt.toISOString();
  const transitionHour = transitionAt.slice(0, 13);
  const errorMessage = cleanOperationalError(payload.errorMessage);
  const body = recovered
    ? `${displayName} recovered from ${oldStatus} and is healthy again.`
    : `${displayName} changed from ${oldStatus} to ${newStatus}.${errorMessage ? ` Reason: ${errorMessage}` : ''}`;

  return {
    type: 'integration_status_alert',
    category: 'SYSTEM',
    priority: newStatus === 'down' ? 'CRITICAL' : (newStatus === 'degraded' ? 'HIGH' : 'NORMAL'),
    channels: recovered ? ['IN_APP'] : ['IN_APP', 'EMAIL'],
    recipientIds: adminIds,
    payload: {
      title: recovered ? `${displayName} recovered` : `${displayName} is ${newStatus}`,
      body,
      deepLink: payload.settingsPath || '/admin/messaging',
      integrationKey: payload.integrationKey,
      displayName,
      oldStatus,
      newStatus,
      errorMessage,
      checkedAt: transitionAt,
    },
    sourceModule: 'integrations',
    sourceEvent: 'INTEGRATION_STATUS_CHANGED',
    // Hour bucketing suppresses repeated scheduler/API-instance transitions
    // while allowing a later incident in a subsequent hour to alert again.
    idempotencyKey: `integration-status:${payload.integrationKey || 'unknown'}:${oldStatus}:${newStatus}:${transitionHour}`.slice(0, 200),
  };
}

export async function findActiveAdminIds() {
  const User = (await import('../auth/user.model.js')).default;
  const Role = (await import('../auth/role.model.js')).default;
  const adminRole = await Role.findOne({ name: 'Admin' }).select('_id').lean();
  if (!adminRole) return [];
  const admins = await User.find({
    role: adminRole._id,
    status: 'active',
    isDeleted: false,
  }).select('_id').lean();
  return admins.map((user) => user._id);
}

export function registerIntegrationsEvents() {
  // NOTE: WIDGET_SUBMISSION_RECEIVED is intentionally not subscribed here.
  // - CRM contact/customer creation is performed synchronously in
  //   widgetSubmission.service.js (_createCrmServiceRequest) during submit().
  // - The dispatcher IN_APP/PUSH/EMAIL notification (AC-11) is handled by
  //   notifications.events.js using payload.assignedTo.
  // The previous log-only handler was removed to avoid confusion / duplication.

  // When appointment is created/updated/cancelled → sync to connected calendars
  eventBus.subscribe(EVENT_TYPES.SCHEDULE_APPOINTMENT_CONFIRMED, async (data) => {
    try {
      const payload = data.payload || data;
      if (payload.assigneeId) {
        const calendarSyncService = (await import('./calendarSync.service.js')).default;
        await calendarSyncService.syncAppointmentToCalendar(payload.assigneeId, {
          title: payload.title || 'Termin',
          startTime: payload.startTime,
          endTime: payload.endTime,
          location: payload.location || '',
          description: payload.description || '',
          externalId: payload.appointmentId,
        });
      }
    } catch (err) {
      logger.error('Failed to sync appointment to calendar', {
        module: 'integrations',
        action: 'event.appointment_confirmed',
        error: { message: err.message },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.SCHEDULE_APPOINTMENT_CANCELLED, async (data) => {
    try {
      const payload = data.payload || data;
      if (payload.assigneeId && payload.externalCalendarEventId) {
        const calendarSyncService = (await import('./calendarSync.service.js')).default;
        await calendarSyncService.deleteCalendarEvent(payload.assigneeId, payload.externalCalendarEventId);
      }
    } catch (err) {
      logger.error('Failed to delete calendar event', {
        module: 'integrations',
        action: 'event.appointment_cancelled',
        error: { message: err.message },
      });
    }
  });

  // When integration status changes → notify admins via Module 13
  eventBus.subscribe(EVENT_TYPES.INTEGRATION_STATUS_CHANGED, async (data) => {
    try {
      const payload = data.payload || data;
      const newStatus = payload.newStatus || payload.currentStatus;
      const oldStatus = payload.oldStatus || payload.previousStatus;

      if (newStatus === 'down' || newStatus === 'degraded' || (newStatus === 'healthy' && ['down', 'degraded'].includes(oldStatus))) {
        // Notify admins via Module 13 notification service
        const notificationService = (await import('../notifications/notification.service.js')).default;
        const adminIds = await findActiveAdminIds();

        if (adminIds.length > 0) {
          const notification = buildIntegrationStatusNotification(payload, adminIds);
          if (notification) {
            try {
              await notificationService.create(notification, null, { ipAddress: 'internal', userAgent: 'event-handler' });
            } catch (error) {
              if (error?.code === ERROR_CODES.NOTIF_DUPLICATE || error?.code === 11000) {
                logger.info('Skipped duplicate integration status alert', {
                  module: 'integrations', action: 'event.integration_status_changed.duplicate',
                  integrationKey: payload.integrationKey, oldStatus, newStatus,
                });
              } else throw error;
            }
          }
        }
      }
    } catch (err) {
      logger.error('Failed to send integration status alert', {
        module: 'integrations',
        action: 'event.integration_status_changed',
        error: { message: err.message },
      });
    }
  });

  // When sync completes or fails → update integration config
  eventBus.subscribe(EVENT_TYPES.INTEGRATION_SYNC_COMPLETED, async (data) => {
    try {
      const payload = data.payload || data;
      const integrationConfigService = (await import('./integrationConfig.service.js')).default;
      await integrationConfigService.updateStatus(payload.integrationKey, 'healthy');
    } catch (err) {
      logger.error('Failed to update integration status after sync', {
        module: 'integrations', action: 'event.sync_completed', error: { message: err.message },
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.INTEGRATION_SYNC_FAILED, async (data) => {
    try {
      const payload = data.payload || data;
      const integrationConfigService = (await import('./integrationConfig.service.js')).default;
      await integrationConfigService.updateStatus(payload.integrationKey, 'degraded', payload.errorMessage);
    } catch (err) {
      logger.error('Failed to update integration status after sync failure', {
        module: 'integrations', action: 'event.sync_failed', error: { message: err.message },
      });
    }
  });

  logger.info('Integration event handlers registered', {
    module: 'integrations',
    action: 'events.register',
    subscribedEvents: [
      'SCHEDULE_APPOINTMENT_CONFIRMED',
      'SCHEDULE_APPOINTMENT_CANCELLED', 'INTEGRATION_STATUS_CHANGED',
      'INTEGRATION_SYNC_COMPLETED', 'INTEGRATION_SYNC_FAILED',
    ],
  });
}
