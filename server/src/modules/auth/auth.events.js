import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Auth module event subscriptions.
 *
 * Registers handlers for domain events that require
 * cross-cutting actions (cache invalidation, etc.).
 */
export function registerAuthEvents() {
  // When a role is updated, invalidate permission cache for all users with that role
  eventBus.subscribe(EVENT_TYPES.ROLE_UPDATED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:permissions:*`);
      logger.info('Permission cache invalidated after role update', {
        module: 'auth',
        action: 'event.role.updated',
        roleId: event.payload?.roleId,
      });
    } catch (err) {
      logger.error('Failed to invalidate permission cache', {
        module: 'auth',
        action: 'event.role.updated',
        error: { message: err.message },
      });
    }
  });

  // When a role is deleted, invalidate permission cache
  eventBus.subscribe(EVENT_TYPES.ROLE_DELETED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:permissions:*`);
      logger.info('Permission cache invalidated after role deletion', {
        module: 'auth',
        action: 'event.role.deleted',
        roleId: event.payload?.roleId,
      });
    } catch (err) {
      logger.error('Failed to invalidate permission cache', {
        module: 'auth',
        action: 'event.role.deleted',
        error: { message: err.message },
      });
    }
  });

  logger.info('Auth event handlers registered', {
    module: 'auth',
    action: 'events.register',
  });
}

export default registerAuthEvents;
