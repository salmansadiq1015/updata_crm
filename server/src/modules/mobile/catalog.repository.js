import CatalogItem from './catalogItem.model.js';
import UserFavorite from './userFavorite.model.js';

class CatalogRepository {
  // --- CatalogItem methods ---

  async search(query, { source, category, limit = 25 } = {}) {
    const filter = {};

    if (query) {
      filter.$or = [
        { description: { $regex: query, $options: 'i' } },
        { itemNumber: { $regex: query, $options: 'i' } },
      ];
    }

    if (source) filter.catalogSource = source;
    if (category) filter.category = category;

    return CatalogItem.find(filter)
      .limit(limit)
      .lean();
  }

  async syncSince(sinceDate) {
    return CatalogItem.find({ updatedAt: { $gt: sinceDate } }).lean();
  }

  async findAll(limit = 1000) {
    return CatalogItem.find().limit(limit).lean();
  }

  // --- UserFavorite methods ---

  async findFavoritesByUser(userId) {
    return UserFavorite.find({ userId })
      .populate({ path: 'catalogItemId', model: 'CatalogItem' })
      .lean();
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
