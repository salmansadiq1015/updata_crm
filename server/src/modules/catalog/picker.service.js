import cacheManager from '../../shared/cache/CacheManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import crypto from 'crypto';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';

const PICKER_TTL = { l1Ttl: 15, l2Ttl: 60 };

class PickerService {
  _hashParams(params) {
    return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
  }

  async searchArticles(query, { categoryId, type, source, limit = 25 } = {}) {
    const { default: articleRepository } = await import('./article.repository.js');
    const Article = (await import('./article.model.js')).default;

    const params = { query, categoryId, type, source, limit };
    const cacheKey = `catalog:picker:articles:${this._hashParams(params)}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const filter = { isDeleted: false };

        if (categoryId) filter.categoryId = categoryId;
        if (type) filter.type = type;
        if (source) filter.source = source;

        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { articleNumber: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ];

        return Article.find(filter)
          .select('_id articleNumber name unitOfMeasure basePrice type categoryId')
          .limit(limit)
          .lean();
      },
      PICKER_TTL,
    );
  }

  async searchTextBlocks(query, { categoryId, limit = 25 } = {}) {
    const TextBlock = (await import('./textBlock.model.js')).default;

    const params = { query, categoryId, limit };
    const cacheKey = `catalog:picker:textblocks:${this._hashParams(params)}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const filter = { isDeleted: false };

        if (categoryId) filter.categoryId = categoryId;

        if (query) {
          filter.$or = [
            { title: { $regex: query, $options: 'i' } },
            { bodyHtml: { $regex: query, $options: 'i' } },
          ];
        }

        const docs = await TextBlock.find(filter)
          .select('_id title bodyHtml price unit')
          .limit(limit)
          .lean();

        // Truncate bodyHtml for picker display
        return docs.map((doc) => ({
          ...doc,
          bodyHtml: doc.bodyHtml ? doc.bodyHtml.substring(0, 200) : '',
        }));
      },
      PICKER_TTL,
    );
  }

  async lookupBarcode(code) {
    const Article = (await import('./article.model.js')).default;

    const article = await Article.findOne({
      isDeleted: false,
      $or: [
        { articleNumber: code },
        { ighArticleNumber: code },
      ],
    }).lean();

    if (!article) throw new NotFoundError('Article', code);

    return article;
  }

  async recordArticleUse(articleId) {
    // Fire-and-forget — publish event; catalog.events.js handler updates lastUsedAt
    eventBus.publish(EVENT_TYPES.CATALOG_ARTICLE_USED, { articleId }, { source: 'catalog:picker' });
  }
}

const pickerService = new PickerService();
export default pickerService;
