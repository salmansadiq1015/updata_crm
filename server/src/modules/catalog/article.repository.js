import Article from './article.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  categoryId: 'objectId',
  catalogConnectionId: 'objectId',
  supplierId: 'objectId',
  supplierName: 'exact',
  type: 'exact',
  status: 'exact',
  source: 'exact',
  manufacturerName: 'exact',
  productGroup: 'exact',
  availabilityStatus: 'exact',
};

const ALLOWED_SORT_FIELDS = [
  'createdAt',
  'name',
  'articleNumber',
  'basePrice',
  'purchasePrice',
  'salesPrice',
  'manufacturerName',
  'supplierName',
  '_id',
];

const POPULATE_FIELDS = [
  { path: 'categoryId', select: 'code name' },
  { path: 'supplierId', select: 'companyName firstName lastName customerNumber' },
  { path: 'catalogConnectionId', select: 'name providerKey type lastSyncStatus lastSyncedAt' },
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
      // Precise search: EVERY word of the query must match at least one field
      // (AND across words, OR across fields). The old behaviour OR'ed 3-char
      // trigram tokens ($in on searchTokens), so a precise title matched almost
      // the whole catalog. `searchField` narrows the fields (name/number/ean).
      const SEARCH_FIELD_SETS = {
        name: ['name'],
        number: ['articleNumber', 'ighArticleNumber', 'manufacturerPartNumber', 'supplierReference', 'externalCatalogItemId'],
        ean: ['ean'],
        all: [
          'name', 'articleNumber', 'description', 'supplierName', 'supplierReference',
          'manufacturerName', 'manufacturerPartNumber', 'productGroup',
          'externalCatalogItemId', 'ighArticleNumber', 'ean',
        ],
      };
      const fields = SEARCH_FIELD_SETS[filters.searchField] || SEARCH_FIELD_SETS.all;
      const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const words = String(search).trim().split(/\s+/).filter(Boolean).slice(0, 8);
      const wordClauses = words.map((word) => ({
        $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(word), $options: 'i' } })),
      }));
      if (wordClauses.length) {
        filter.$and = [...(filter.$and || []), ...wordClauses];
      }
    }
    delete filters.searchField;

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
        update: {
          $set: {
            basePrice: u.basePrice,
            salesPrice: u.basePrice,
            updatedBy: u.updatedBy,
          },
          $inc: { version: 1 },
        },
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
          manufacturers: [
            { $match: { manufacturerName: { $nin: [null, ''] } } },
            { $group: { _id: '$manufacturerName', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 },
          ],
          suppliers: [
            { $match: { supplierName: { $nin: [null, ''] } } },
            { $group: { _id: '$supplierName', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 },
          ],
          productGroups: [
            { $match: { productGroup: { $nin: [null, ''] } } },
            { $group: { _id: '$productGroup', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 },
          ],
          availabilityStatuses: [{ $group: { _id: '$availabilityStatus', count: { $sum: 1 } } }],
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
      manufacturers: (result?.manufacturers ?? []).map((f) => ({ value: f._id, count: f.count })),
      suppliers: (result?.suppliers ?? []).map((f) => ({ value: f._id, count: f.count })),
      productGroups: (result?.productGroups ?? []).map((f) => ({ value: f._id, count: f.count })),
      availabilityStatuses: (result?.availabilityStatuses ?? []).map((f) => ({ value: f._id, count: f.count })),
      priceRange: result?.priceRange?.[0]
        ? { min: result.priceRange[0].min, max: result.priceRange[0].max }
        : { min: 0, max: 0 },
      total: result?.total?.[0]?.count ?? 0,
    };
  }
}

const articleRepository = new ArticleRepository();
export default articleRepository;
