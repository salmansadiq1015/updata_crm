import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Deploy domain event handlers.
 *
 * Subscribes to cross-cutting events that affect deploy caches and state.
 * All handlers are defensive -- errors are logged but never re-thrown
 * to avoid breaking the publisher.
 */
export function registerDeployEvents() {
  // --- PROJECT_STATUS_CHANGED ---
  eventBus.on(EVENT_TYPES.PROJECT_STATUS_CHANGED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);

      logger.info('Deploy calendar + dashboard caches invalidated after project status change', {
        module: 'deploy',
        action: 'event.project_status_changed',
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle PROJECT_STATUS_CHANGED event in deploy', {
        module: 'deploy',
        action: 'event.project_status_changed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CUSTOMER_UPDATED ---
  eventBus.on(EVENT_TYPES.CUSTOMER_UPDATED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);

      logger.info('Deploy calendar caches invalidated after customer update', {
        module: 'deploy',
        action: 'event.customer_updated',
        customerId: event.payload?.customerId,
      });
    } catch (err) {
      logger.error('Failed to handle CUSTOMER_UPDATED event in deploy', {
        module: 'deploy',
        action: 'event.customer_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_CREATED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);

      logger.info('Deploy dashboard caches invalidated after assignment created', {
        module: 'deploy',
        action: 'event.assignment_created',
        assignmentId: event.payload?.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_CREATED event in deploy', {
        module: 'deploy',
        action: 'event.assignment_created',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_MOVED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_MOVED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);

      logger.info('Deploy calendar + dashboard caches invalidated after assignment moved', {
        module: 'deploy',
        action: 'event.assignment_moved',
        assignmentId: event.payload?.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_MOVED event in deploy', {
        module: 'deploy',
        action: 'event.assignment_moved',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ASSIGNMENT_CANCELLED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CANCELLED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:dashboard:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:coarse:*`);

      logger.info('All deploy caches invalidated after assignment cancelled', {
        module: 'deploy',
        action: 'event.assignment_cancelled',
        assignmentId: event.payload?.assignmentId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ASSIGNMENT_CANCELLED event in deploy', {
        module: 'deploy',
        action: 'event.assignment_cancelled',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- PM SCHEDULE ENTRY changes (CREATED / UPDATED / DELETED / CASCADED) ---
  // PM internal-team schedule entries are surfaced read-only in the deploy
  // calendar (see calendar.service.js). When they change, invalidate the
  // deploy calendar cache so dispatchers see the updated project work.
  const invalidateCalendarOnScheduleChange = async (event, eventName) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:calendar:*`);
      logger.info('Deploy calendar caches invalidated after PM schedule change', {
        module: 'deploy',
        action: `event.${eventName}`,
        entryId: event.payload?.entryId,
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle PM schedule change event in deploy', {
        module: 'deploy',
        action: `event.${eventName}`,
        error: { message: err.message, stack: err.stack },
      });
    }
  };

  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, (e) => invalidateCalendarOnScheduleChange(e, 'schedule_entry_created'));
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_UPDATED, (e) => invalidateCalendarOnScheduleChange(e, 'schedule_entry_updated'));
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_DELETED, (e) => invalidateCalendarOnScheduleChange(e, 'schedule_entry_deleted'));
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRIES_CASCADED, (e) => invalidateCalendarOnScheduleChange(e, 'schedule_entries_cascaded'));

  logger.info('Deploy event handlers registered', { module: 'deploy', action: 'events.register' });
}

export default registerDeployEvents;
