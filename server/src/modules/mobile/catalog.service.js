import catalogRepository from './catalog.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

const CATALOG_TTL = { l1Ttl: 300, l2Ttl: 900 };
const FAVORITES_TTL = { l1Ttl: 60, l2Ttl: 300 };

class CatalogService {
  async search(query, filters = {}) {
    const hash = Buffer.from(JSON.stringify({ query, ...filters })).toString('base64');
    const cacheKey = `mobile:catalog:${hash}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => catalogRepository.search(query, filters),
      CATALOG_TTL,
    );
  }

  async fullSync() {
    logger.info('Full catalog sync requested', { module: 'mobile', action: 'catalog.fullSync' });
    return catalogRepository.findAll();
  }

  async incrementalSync(since) {
    logger.info('Incremental catalog sync requested', { module: 'mobile', action: 'catalog.incrementalSync', since });
    return catalogRepository.syncSince(new Date(since));
  }

  async listFavorites(userId) {
    const cacheKey = `mobile:catalog:favorites:${userId}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => catalogRepository.findFavoritesByUser(userId),
      FAVORITES_TTL,
    );
  }

  async addFavorite(userId, itemId) {
    const result = await catalogRepository.addFavorite(userId, itemId);
    await cacheManager.del(`mobile:catalog:favorites:${userId}`);

    logger.info('Catalog favorite added', { module: 'mobile', action: 'catalog.addFavorite', userId, itemId });

    return result;
  }

  async removeFavorite(userId, itemId) {
    await catalogRepository.removeFavorite(userId, itemId);
    await cacheManager.del(`mobile:catalog:favorites:${userId}`);

    logger.info('Catalog favorite removed', { module: 'mobile', action: 'catalog.removeFavorite', userId, itemId });
  }

  async listRecent(userId) {
    // Placeholder — recent items tracking deferred to Phase B
    return [];
  }
}

const catalogService = new CatalogService();
export default catalogService;
