import Article from './article.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';
import { buildSearchTokens } from './catalogNormalization.js';

const ALLOWED_FILTERS = {
  categoryId: 'objectId',
  type: 'exact',
  status: 'exact',
  source: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'articleNumber', 'basePrice', '_id'];

const POPULATE_FIELDS = [
  { path: 'categoryId', select: 'code name' },
];

class ArticleRepository {
  async create(data) {
    const article = new Article(data);
    return article.save();
  }

  async findById(id) {
    return Article.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findByArticleNumber(articleNumber) {
    return Article.findOne({ articleNumber }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    if (search) {
      const searchTokens = buildSearchTokens(search);
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { articleNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { supplierReference: { $regex: search, $options: 'i' } },
        ...(searchTokens.length ? [{ searchTokens: { $in: searchTokens } }] : []),
      ];
    }

    // Price range filters
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      filter.basePrice = {};
      if (filters.priceMin !== undefined) filter.basePrice.$gte = filters.priceMin;
      if (filters.priceMax !== undefined) filter.basePrice.$lte = filters.priceMax;
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Article.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async textSearch(searchTerm, limit = 25) {
    return Article.find(
      { $text: { $search: searchTerm } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async updateById(id, data, { expectedVersion } = {}) {
    const filter = expectedVersion === undefined ? { _id: id } : { _id: id, version: expectedVersion };
    return Article.findOneAndUpdate(
      filter,
      { ...data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id) {
    return Article.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async bulkCreate(docs) {
    return Article.insertMany(docs, { ordered: false });
  }

  async bulkUpdatePrices(updates) {
    const operations = updates.map((u) => ({
      updateOne: {
        filter: { _id: u.id, isDeleted: false },
        update: { $set: { basePrice: u.basePrice, updatedBy: u.updatedBy }, $inc: { version: 1 } },
      },
    }));
    return Article.bulkWrite(operations);
  }

  async updateLastUsedAt(id) {
    return Article.findByIdAndUpdate(id, { lastUsedAt: new Date() });
  }

  async countByUnit(code) {
    return Article.countDocuments({ unitOfMeasure: code, isDeleted: false });
  }

  async countByCategory(id) {
    return Article.countDocuments({ categoryId: id, isDeleted: false });
  }

  async findByIds(ids) {
    return Article.find({ _id: { $in: ids }, isDeleted: false }).lean();
  }

  async getFacets(filter = {}) {
    const match = { isDeleted: false };
    if (filter.categoryId) match.categoryId = filter.categoryId;
    if (filter.q) match.$text = { $search: filter.q };

    const [result] = await Article.aggregate([
      { $match: match },
      {
        $facet: {
          types: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          sources: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
          priceRange: [
            { $group: { _id: null, min: { $min: '$basePrice' }, max: { $max: '$basePrice' } } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    return {
      types: (result?.types ?? []).map((f) => ({ value: f._id, count: f.count })),
      statuses: (result?.statuses ?? []).map((f) => ({ value: f._id, count: f.count })),
      sources: (result?.sources ?? []).map((f) => ({ value: f._id, count: f.count })),
      priceRange: result?.priceRange?.[0]
        ? { min: result.priceRange[0].min, max: result.priceRange[0].max }
        : { min: 0, max: 0 },
      total: result?.total?.[0]?.count ?? 0,
    };
  }
}

const articleRepository = new ArticleRepository();
export default articleRepository;
