import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Catalog domain event handlers.
 *
 * Subscribes to cross-cutting events that affect catalog caches and state.
 * All handlers are defensive — errors are logged but never re-thrown
 * to avoid breaking the publisher.
 */
export function registerCatalogEvents() {
  // --- CATALOG_ARTICLE_PRICE_CHANGED ---
  // Invalidate picker cache when a single article price changes
  eventBus.on(EVENT_TYPES.CATALOG_ARTICLE_PRICE_CHANGED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Picker cache invalidated after article price change', {
        module: 'catalog',
        action: 'event.price_changed',
        articleId: event.payload.articleId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_ARTICLE_PRICE_CHANGED event', {
        module: 'catalog',
        action: 'event.price_changed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_IGH_IMPORT_COMPLETED ---
  // Invalidate all article list caches and picker caches
  eventBus.on(EVENT_TYPES.CATALOG_IGH_IMPORT_COMPLETED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Article and picker caches invalidated after IGH import', {
        module: 'catalog',
        action: 'event.igh_import_completed',
        jobId: event.payload.jobId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_IGH_IMPORT_COMPLETED event', {
        module: 'catalog',
        action: 'event.igh_import_completed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_SYNC_COMPLETED ---
  // Invalidate all article list caches and picker caches after connected catalog sync
  eventBus.on(EVENT_TYPES.CATALOG_SYNC_COMPLETED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:facets:*`);

      logger.info('Article and picker caches invalidated after connected catalog sync', {
        module: 'catalog',
        action: 'event.catalog_sync_completed',
        connectionId: event.payload.connectionId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_SYNC_COMPLETED event', {
        module: 'catalog',
        action: 'event.catalog_sync_completed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_MARKUP_RULE_CHANGED ---
  eventBus.on(EVENT_TYPES.CATALOG_MARKUP_RULE_CHANGED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Catalog caches invalidated after markup rule change', {
        module: 'catalog',
        action: 'event.markup_rule_changed',
        ruleId: event.payload.ruleId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_MARKUP_RULE_CHANGED event', {
        module: 'catalog',
        action: 'event.markup_rule_changed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_IGH_IMPORT_FAILED ---
  // Notify users with admin or catalog:admin permissions when an IGH import fails
  eventBus.on(EVENT_TYPES.CATALOG_IGH_IMPORT_FAILED, async (event) => {
    try {
      const notificationService = (await import('../notifications/notification.service.js')).default;
      const User = (await import('../auth/user.model.js')).default;

      // Find active users whose role grants admin or catalog:admin access.
      // Populate role → permissions so we can filter by permission key.
      const candidates = await User.find({ status: 'active', isDeleted: false })
        .select('_id')
        .populate({ path: 'role', select: 'name permissions', populate: { path: 'permissions', select: 'module action' } })
        .lean();

      const recipientIds = candidates
        .filter((u) => {
          if (!u.role) return false;
          if (u.role.name === 'Admin') return true;
          return (u.role.permissions || []).some(
            (p) => p.module === 'catalog' && p.action === 'admin',
          );
        })
        .map((u) => u._id)
        .slice(0, 50);

      if (recipientIds.length > 0) {
        await notificationService.create(
          {
            type: 'igh_import_failed',
            category: 'SYSTEM',
            priority: 'HIGH',
            channels: ['IN_APP', 'EMAIL'],
            recipientIds,
            payload: {
              jobId: event.payload.jobId,
              errorMessage: event.payload.error || 'Unknown error',
            },
            sourceModule: 'catalog',
            sourceEvent: 'CATALOG_IGH_IMPORT_FAILED',
            idempotencyKey: `igh-import-failed-${event.payload.jobId}`,
          },
          null,
          { ipAddress: 'internal', userAgent: 'event-handler' },
        );
      }

      logger.warn('IGH import failure notification sent to admins', {
        module: 'catalog',
        action: 'event.igh_import_failed',
        jobId: event.payload.jobId,
        error: event.payload.error,
        recipientCount: recipientIds.length,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_IGH_IMPORT_FAILED event', {
        module: 'catalog',
        action: 'event.igh_import_failed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_PRICE_BATCH_APPLIED ---
  // Invalidate affected article caches
  eventBus.on(EVENT_TYPES.CATALOG_PRICE_BATCH_APPLIED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);

      logger.info('Article caches invalidated after price batch applied', {
        module: 'catalog',
        action: 'event.price_batch_applied',
        batchId: event.payload.batchId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_PRICE_BATCH_APPLIED event', {
        module: 'catalog',
        action: 'event.price_batch_applied',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- CATALOG_ARTICLE_USED ---
  // Update lastUsedAt on the article (fire-and-forget)
  eventBus.on(EVENT_TYPES.CATALOG_ARTICLE_USED, async (event) => {
    try {
      const { default: articleRepository } = await import('./article.repository.js');
      const { articleId } = event.payload;

      // Fire-and-forget — do not await for response envelope
      articleRepository.updateLastUsedAt(articleId).catch((updateErr) => {
        logger.warn('Failed to update article lastUsedAt', {
          module: 'catalog',
          action: 'event.article_used',
          articleId,
          error: { message: updateErr.message },
        });
      });

      logger.debug('Article lastUsedAt update triggered', {
        module: 'catalog',
        action: 'event.article_used',
        articleId,
      });
    } catch (err) {
      logger.error('Failed to handle CATALOG_ARTICLE_USED event', {
        module: 'catalog',
        action: 'event.article_used',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('Catalog event handlers registered', { module: 'catalog', action: 'events.register' });
}

export default registerCatalogEvents;
