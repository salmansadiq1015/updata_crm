import Article from '../catalog/article.model.js';
import UserFavorite from './userFavorite.model.js';
import { buildSearchTokens } from '../catalog/catalogNormalization.js';

function serializeArticle(article) {
  return {
    id: String(article._id),
    catalogItemId: String(article._id),
    itemNumber: article.articleNumber,
    articleNumber: article.articleNumber,
    catalogSource: article.source,
    description: article.name,
    details: article.description || '',
    category: article.categoryId ? String(article.categoryId) : null,
    unit: article.unitOfMeasure,
    basePrice: article.basePrice,
    currency: article.currency || 'CHF',
    isActive: article.status === 'ACTIVE',
    updatedAt: article.updatedAt,
    catalogSnapshot: {
      catalogArticleId: article._id,
      articleNumber: article.articleNumber,
      articleName: article.name,
      articleDescription: article.description || '',
      unitOfMeasure: article.unitOfMeasure,
      snapshotBasePrice: article.basePrice,
      snapshotCurrency: article.currency || 'CHF',
      catalogSource: article.source || 'INTERNAL',
      snapshotTakenAt: new Date(),
    },
  };
}

class CatalogRepository {
  async search(query, { source, category, limit = 25 } = {}) {
    const filter = { isDeleted: false, status: 'ACTIVE' };

    if (query) {
      const searchTokens = buildSearchTokens(query);
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { articleNumber: { $regex: query, $options: 'i' } },
        { supplierReference: { $regex: query, $options: 'i' } },
        { ighArticleNumber: { $regex: query, $options: 'i' } },
        ...(searchTokens.length ? [{ searchTokens: { $in: searchTokens } }] : []),
      ];
    }

    if (source && source !== 'ALL') filter.source = source;
    if (category) filter.categoryId = category;

    const docs = await Article.find(filter)
      .sort({ articleNumber: 1 })
      .limit(limit)
      .lean();
    return docs.map(serializeArticle);
  }

  async syncSince(sinceDate) {
    const docs = await Article.find({
      isDeleted: false,
      updatedAt: { $gt: sinceDate },
    })
      .sort({ updatedAt: 1 })
      .limit(5000)
      .lean();
    return docs.map(serializeArticle);
  }

  async findAll(limit = 1000) {
    const docs = await Article.find({ isDeleted: false, status: 'ACTIVE' })
      .sort({ articleNumber: 1 })
      .limit(limit)
      .lean();
    return docs.map(serializeArticle);
  }

  async findFavoritesByUser(userId) {
    const favorites = await UserFavorite.find({ userId }).lean();
    const ids = favorites.map((favorite) => favorite.catalogItemId);
    const docs = await Article.find({ _id: { $in: ids }, isDeleted: false }).lean();
    const articleMap = new Map(docs.map((article) => [article._id.toString(), serializeArticle(article)]));
    return favorites.map((favorite) => ({
      ...favorite,
      catalogItem: articleMap.get(favorite.catalogItemId) || null,
    }));
  }

  async addFavorite(userId, catalogItemId) {
    const favorite = new UserFavorite({ userId, catalogItemId });
    return favorite.save();
  }

  async removeFavorite(userId, catalogItemId) {
    return UserFavorite.findOneAndDelete({ userId, catalogItemId });
  }

  async isItemFavorited(userId, catalogItemId) {
    const count = await UserFavorite.countDocuments({ userId, catalogItemId });
    return count > 0;
  }
}

const catalogRepository = new CatalogRepository();
export default catalogRepository;
