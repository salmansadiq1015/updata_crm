import crypto from 'crypto';
import CatalogSearchAnalytics from './catalogSearchAnalytics.model.js';
import CatalogRecentSearch from './catalogRecentSearch.model.js';
import { normalizeSearchTerm, normalizeSearchText } from './catalogNormalization.js';
import logger from '../../shared/logger/index.js';

const RECENT_LIMIT = 10;

function stableJson(value = {}) {
  if (!value || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))));
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item !== undefined && item !== '' && item !== null) out[key] = item;
  }
  return JSON.stringify(out);
}

function hashValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

class CatalogSearchService {
  async recordSearch({ userId, queryParams = {}, resultCount = 0, surface = 'articles', ipAddress, userAgent }) {
    const query = normalizeSearchTerm(queryParams);
    const queryNormalized = normalizeSearchText(query);
    if (!userId || !queryNormalized) return null;

    const filters = { ...queryParams };
    for (const key of ['cursor', 'limit', 'sortBy', 'sortOrder', 'q', 'search']) {
      delete filters[key];
    }
    const filtersHash = hashValue(stableJson(filters));

    try {
      await CatalogSearchAnalytics.create({
        query,
        queryNormalized,
        filtersHash,
        resultCount,
        surface,
        userHash: hashValue(userId),
        ipHash: hashValue(ipAddress),
        userAgentHash: hashValue(userAgent),
      });

      await CatalogRecentSearch.findOneAndUpdate(
        { userId, queryNormalized, filtersHash },
        {
          $set: {
            query,
            queryNormalized,
            filters,
            filtersHash,
            surface,
            lastUsedAt: new Date(),
          },
          $inc: { useCount: 1 },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );

      await this._capRecent(userId);
    } catch (err) {
      logger.warn('Failed to record catalog search', {
        module: 'catalog',
        action: 'recordSearch',
        error: { message: err.message },
      });
    }
    return null;
  }

  async listRecent(userId, { limit = RECENT_LIMIT } = {}) {
    return CatalogRecentSearch.find({ userId })
      .sort({ lastUsedAt: -1 })
      .limit(Math.min(Number(limit) || RECENT_LIMIT, RECENT_LIMIT))
      .select('-__v')
      .lean();
  }

  async _capRecent(userId) {
    const overflow = await CatalogRecentSearch.find({ userId })
      .sort({ lastUsedAt: -1 })
      .skip(RECENT_LIMIT)
      .select('_id')
      .lean();
    if (overflow.length) {
      await CatalogRecentSearch.deleteMany({ _id: { $in: overflow.map((item) => item._id) } });
    }
  }
}

const catalogSearchService = new CatalogSearchService();
export default catalogSearchService;
