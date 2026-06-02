import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

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
      if (payload.newStatus === 'down' || payload.newStatus === 'degraded') {
        // Notify admins via Module 13 notification service
        const notificationService = (await import('../notifications/notification.service.js')).default;
        // Get admin users
        const User = (await import('../auth/user.model.js')).default;
        const admins = await User.find({ isActive: true }).select('_id role').lean();
        const adminIds = admins
          .filter((u) => u.role?.name === 'Admin' || u.role === 'admin')
          .map((u) => u._id)
          .slice(0, 10);

        if (adminIds.length > 0) {
          await notificationService.create({
            type: 'integration_status_alert',
            category: 'SYSTEM',
            priority: payload.newStatus === 'down' ? 'CRITICAL' : 'HIGH',
            channels: ['IN_APP', 'EMAIL'],
            recipientIds: adminIds,
            payload: {
              integrationKey: payload.integrationKey,
              displayName: payload.displayName || payload.integrationKey,
              oldStatus: payload.oldStatus,
              newStatus: payload.newStatus,
              errorMessage: payload.errorMessage || null,
            },
            sourceModule: 'integrations',
            sourceEvent: 'INTEGRATION_STATUS_CHANGED',
          }, null, { ipAddress: 'internal', userAgent: 'event-handler' });
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
