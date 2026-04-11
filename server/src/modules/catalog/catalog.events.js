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
      articleRepository.updateById(articleId, { lastUsedAt: new Date() }).catch((updateErr) => {
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
