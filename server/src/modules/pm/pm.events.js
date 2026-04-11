import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * PM domain event handlers.
 *
 * Subscribes to cross-cutting events that affect PM caches and state.
 * All handlers are defensive -- errors are logged but never re-thrown
 * to avoid breaking the publisher.
 */
export function registerPmEvents() {
  // --- CUSTOMER_UPDATED ---
  eventBus.on(EVENT_TYPES.CUSTOMER_UPDATED, async (event) => {
    try {
      // Customer data is denormalised via populate in project queries,
      // so invalidate project list caches when a customer changes.
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:projects:list:*`);

      logger.info('PM project list caches invalidated after customer update', {
        module: 'pm',
        action: 'event.customer_updated',
        customerId: event.payload?.customerId,
      });
    } catch (err) {
      logger.error('Failed to handle CUSTOMER_UPDATED event in PM', {
        module: 'pm',
        action: 'event.customer_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- PROJECT_STATUS_CHANGED ---
  eventBus.on(EVENT_TYPES.PROJECT_STATUS_CHANGED, async (event) => {
    try {
      await cacheManager.del('pm:dashboard:summary');
      await cacheManager.del('pm:dashboard:milestones');

      logger.info('PM dashboard caches invalidated after project status change', {
        module: 'pm',
        action: 'event.project_status_changed',
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle PROJECT_STATUS_CHANGED event in PM', {
        module: 'pm',
        action: 'event.project_status_changed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- PREP_ACTION_UPDATED ---
  eventBus.on(EVENT_TYPES.PREP_ACTION_UPDATED, async (event) => {
    try {
      // Prep action completion can affect status transition preconditions
      await cacheManager.del('pm:dashboard:summary');
      await cacheManager.del('pm:dashboard:milestones');

      logger.info('PM dashboard caches invalidated after prep action update', {
        module: 'pm',
        action: 'event.prep_action_updated',
        actionId: event.payload?.actionId,
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle PREP_ACTION_UPDATED event in PM', {
        module: 'pm',
        action: 'event.prep_action_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('PM event handlers registered', { module: 'pm', action: 'events.register' });
}

export default registerPmEvents;
