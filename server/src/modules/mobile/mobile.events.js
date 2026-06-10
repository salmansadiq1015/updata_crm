import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Mobile domain event handlers.
 *
 * Subscribes to cross-cutting events that affect mobile state and notifications.
 * All handlers are defensive -- errors are logged but never re-thrown
 * to avoid breaking the publisher.
 */
export function registerMobileEvents() {
  // --- SCHEDULE_ASSIGNMENT_CREATED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, async (event) => {
    try {
      const { default: notificationService } = await import('./notification.service.js');
      const payload = event.payload || {};

      if (payload.employeeIds?.length) {
        for (const employeeId of payload.employeeIds) {
          await notificationService.sendNotification(employeeId, {
            notificationType: 'NEW_ASSIGNMENT',
            title: 'Neuer Auftrag',
            body: `Ein neuer Auftrag wurde Ihnen zugewiesen: ${payload.title || 'Unbenannt'}`,
            deepLink: `/orders/${payload.assignmentId}`,
          });
        }
      }

      logger.info('Mobile notification sent for new assignment', {
        module: 'mobile',
        action: 'event.assignment_created',
        assignmentId: payload.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_CREATED event in mobile', {
        module: 'mobile',
        action: 'event.assignment_created',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_UPDATED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_UPDATED, async (event) => {
    try {
      const { default: notificationService } = await import('./notification.service.js');
      const payload = event.payload || {};

      if (payload.employeeIds?.length) {
        for (const employeeId of payload.employeeIds) {
          await notificationService.sendNotification(employeeId, {
            notificationType: 'ORDER_CHANGED',
            title: 'Auftrag geaendert',
            body: `Ein Auftrag wurde aktualisiert: ${payload.title || 'Unbenannt'}`,
            deepLink: `/orders/${payload.assignmentId}`,
          });
        }
      }

      logger.info('Mobile notification sent for assignment update', {
        module: 'mobile',
        action: 'event.assignment_updated',
        assignmentId: payload.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_UPDATED event in mobile', {
        module: 'mobile',
        action: 'event.assignment_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_MOVED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_MOVED, async (event) => {
    try {
      const { default: notificationService } = await import('./notification.service.js');
      const payload = event.payload || {};

      if (payload.employeeIds?.length) {
        for (const employeeId of payload.employeeIds) {
          await notificationService.sendNotification(employeeId, {
            notificationType: 'ORDER_CHANGED',
            title: 'Auftrag neu geplant',
            body: `Ein Auftrag wurde neu geplant: ${payload.title || 'Unbenannt'}`,
            deepLink: `/orders/${payload.assignmentId}`,
          });
        }
      }

      logger.info('Mobile notification sent for assignment move', {
        module: 'mobile',
        action: 'event.assignment_moved',
        assignmentId: payload.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_MOVED event in mobile', {
        module: 'mobile',
        action: 'event.assignment_moved',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_CANCELLED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CANCELLED, async (event) => {
    try {
      const { default: notificationService } = await import('./notification.service.js');
      const payload = event.payload || {};

      if (payload.employeeIds?.length) {
        for (const employeeId of payload.employeeIds) {
          await notificationService.sendNotification(employeeId, {
            notificationType: 'ORDER_CANCELLED',
            title: 'Auftrag storniert',
            body: `Ein Auftrag wurde storniert: ${payload.title || 'Unbenannt'}`,
            deepLink: '/orders',
          });
        }
      }

      logger.info('Mobile notification sent for assignment cancellation', {
        module: 'mobile',
        action: 'event.assignment_cancelled',
        assignmentId: payload.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_CANCELLED event in mobile', {
        module: 'mobile',
        action: 'event.assignment_cancelled',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- MOBILE_REPORT_SUBMITTED ---
  eventBus.on(EVENT_TYPES.MOBILE_REPORT_SUBMITTED, async (event) => {
    try {
      const payload = event.payload || {};

      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}mobile:report:*`);

      logger.info('Mobile report submitted, cache invalidated', {
        module: 'mobile',
        action: 'event.report_submitted',
        reportId: payload.reportId,
        reportNumber: payload.reportNumber,
      });
    } catch (err) {
      logger.error('Failed to handle MOBILE_REPORT_SUBMITTED event in mobile', {
        module: 'mobile',
        action: 'event.report_submitted',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- MOBILE_CHAT_MESSAGE_SENT ---
  eventBus.on(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, async (event) => {
    try {
      const { default: notificationService } = await import('./notification.service.js');
      const payload = event.payload || {};

      // Send CHAT_MESSAGE notification to all project team members except the sender
      if (payload.projectTeamIds?.length) {
        const recipients = payload.projectTeamIds.filter(
          (id) => String(id) !== String(payload.senderId),
        );

        for (const userId of recipients) {
          await notificationService.sendNotification(userId, {
            notificationType: 'CHAT_MESSAGE',
            title: 'Neue Nachricht',
            body: `${payload.senderName || 'Jemand'}: ${(payload.content || '').substring(0, 100)}`,
            deepLink: `/projects/${payload.projectId}/chat`,
          });
        }
      }

      logger.info('Mobile chat message notification sent', {
        module: 'mobile',
        action: 'event.chat_message_sent',
        projectId: payload.projectId,
        senderId: payload.senderId,
      });
    } catch (err) {
      logger.error('Failed to handle MOBILE_CHAT_MESSAGE_SENT event in mobile', {
        module: 'mobile',
        action: 'event.chat_message_sent',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('Mobile event handlers registered', { module: 'mobile', action: 'events.register' });
}

export default registerMobileEvents;
