import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * CRM domain event handlers.
 *
 * Subscribes to cross-cutting events that affect CRM caches and state.
 * All handlers are defensive — errors are logged but never re-thrown
 * to avoid breaking the publisher.
 */
export function registerCrmEvents() {
  // --- CUSTOMER_MERGED ---
  eventBus.on(EVENT_TYPES.CUSTOMER_MERGED, async (event) => {
    try {
      const { sourceId, targetId } = event.payload;

      // Invalidate contact caches for both source and target
      await cacheManager.del(`crm:contacts:customer:${sourceId}`);
      await cacheManager.del(`crm:contacts:customer:${targetId}`);

      // Invalidate site caches for both source and target
      await cacheManager.del(`crm:sites:customer:${sourceId}`);
      await cacheManager.del(`crm:sites:customer:${targetId}`);

      logger.info('CRM caches invalidated after customer merge', {
        module: 'crm',
        action: 'event.customer_merged',
        sourceId,
        targetId,
      });
    } catch (err) {
      logger.error('Failed to handle CUSTOMER_MERGED event', {
        module: 'crm',
        action: 'event.customer_merged',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- INSTALLATION_DECOMMISSIONED ---
  eventBus.on(EVENT_TYPES.INSTALLATION_DECOMMISSIONED, async (event) => {
    try {
      const { installationId, siteId } = event.payload;

      // Invalidate installations cache for the site
      await cacheManager.del(`crm:installations:site:${siteId}`);

      // Invalidate maintenance caches
      await cacheManager.del('crm:maintenance:dashboard');
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}crm:maintenance:installation:*`);

      logger.info('CRM caches invalidated after installation decommission', {
        module: 'crm',
        action: 'event.installation_decommissioned',
        installationId,
        siteId,
      });
    } catch (err) {
      logger.error('Failed to handle INSTALLATION_DECOMMISSIONED event', {
        module: 'crm',
        action: 'event.installation_decommissioned',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- MAINTENANCE_OVERDUE ---
  eventBus.on(EVENT_TYPES.MAINTENANCE_OVERDUE, async (event) => {
    try {
      const { count } = event.payload;

      logger.warn(`${count} maintenance interval(s) are now overdue`, {
        module: 'crm',
        action: 'event.maintenance_overdue',
        count,
      });
    } catch (err) {
      logger.error('Failed to handle MAINTENANCE_OVERDUE event', {
        module: 'crm',
        action: 'event.maintenance_overdue',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('CRM event handlers registered', { module: 'crm', action: 'events.register' });
}

export default registerCrmEvents;
