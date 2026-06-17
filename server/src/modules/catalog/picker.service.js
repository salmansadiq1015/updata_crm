import cacheManager from '../../shared/cache/CacheManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import crypto from 'crypto';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { buildSearchTokens } from './catalogNormalization.js';

const PICKER_TTL = { l1Ttl: 15, l2Ttl: 60 };

class PickerService {
  _hashParams(params) {
    return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
  }

  async searchArticles(query, { categoryId, type, source, limit = 25 } = {}) {
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

        const searchTokens = buildSearchTokens(query);
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { articleNumber: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { supplierName: { $regex: query, $options: 'i' } },
          { supplierReference: { $regex: query, $options: 'i' } },
          { manufacturerName: { $regex: query, $options: 'i' } },
          { manufacturerPartNumber: { $regex: query, $options: 'i' } },
          { productGroup: { $regex: query, $options: 'i' } },
          { externalCatalogItemId: { $regex: query, $options: 'i' } },
          { ighArticleNumber: { $regex: query, $options: 'i' } },
          ...(searchTokens.length ? [{ searchTokens: { $in: searchTokens } }] : []),
        ];

        const articles = await Article.find(filter)
          .select('_id articleNumber name description unitOfMeasure basePrice purchasePrice salesPrice currency type source categoryId catalogConnectionId externalCatalogItemId supplierId supplierName supplierReference manufacturerName manufacturerPartNumber productGroup availabilityStatus availableQuantity markupPercent marginPercent ighArticleNumber')
          .limit(limit)
          .lean();
        return articles.map((article) => ({
          ...article,
          catalogArticleId: article._id,
          snapshotPrice: article.salesPrice ?? article.basePrice,
          snapshot: {
            catalogArticleId: article._id,
            articleNumber: article.articleNumber,
            articleName: article.name,
            articleDescription: article.description,
            unitOfMeasure: article.unitOfMeasure,
            snapshotBasePrice: article.basePrice,
            snapshotPurchasePrice: article.purchasePrice ?? 0,
            snapshotSalesPrice: article.salesPrice ?? article.basePrice,
            snapshotCurrency: article.currency || 'CHF',
            catalogSource: article.source || 'INTERNAL',
            catalogConnectionId: article.catalogConnectionId ?? null,
            externalCatalogItemId: article.externalCatalogItemId || '',
            supplierId: article.supplierId ?? null,
            supplierName: article.supplierName || '',
            manufacturerName: article.manufacturerName || '',
            manufacturerPartNumber: article.manufacturerPartNumber || '',
            productGroup: article.productGroup || '',
            availabilityStatus: article.availabilityStatus || 'UNKNOWN',
            availableQuantity: article.availableQuantity ?? null,
            appliedMarkupPercent: article.markupPercent ?? null,
            marginPercent: article.marginPercent ?? null,
            manualPriceOverride: false,
            snapshotTakenAt: new Date().toISOString(),
          },
        }));
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
    const CatalogBarcodeReference = (await import('./catalogBarcodeReference.model.js')).default;
    const barcodeRef = await CatalogBarcodeReference.findOne({ code, isActive: true }).lean();

    const article = await Article.findOne({
      isDeleted: false,
      $or: [
        ...(barcodeRef?.articleId ? [{ _id: barcodeRef.articleId }] : []),
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
