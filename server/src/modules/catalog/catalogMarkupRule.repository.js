import CatalogMarkupRule from './catalogMarkupRule.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  scope: 'exact',
  isActive: 'boolean',
  supplierId: 'objectId',
  categoryId: 'objectId',
  articleId: 'objectId',
  manufacturerName: 'exact',
  productGroup: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'scope', 'priority', '_id'];

const POPULATE_FIELDS = [
  { path: 'supplierId', select: 'companyName firstName lastName customerNumber' },
  { path: 'categoryId', select: 'code name' },
  { path: 'articleId', select: 'articleNumber name' },
];

class CatalogMarkupRuleRepository {
  async create(data) {
    const rule = new CatalogMarkupRule(data);
    return rule.save();
  }

  async findById(id) {
    return CatalogMarkupRule.findById(id).populate(POPULATE_FIELDS).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'priority', sortOrder = 'asc', filters = {}, search }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'priority';
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { manufacturerName: { $regex: search, $options: 'i' } },
        { productGroup: { $regex: search, $options: 'i' } },
      ];
    }

    const docs = await CatalogMarkupRule.find(filter)
      .sort(buildCursorSort(safeSortBy, sortOrder))
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data) {
    return CatalogMarkupRule.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).populate(POPULATE_FIELDS).lean();
  }

  async softDelete(id) {
    return CatalogMarkupRule.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), isActive: false },
      { returnDocument: 'after' },
    ).lean();
  }

  async findActiveCandidates(article = {}, now = new Date()) {
    const candidateClauses = [{ scope: 'GLOBAL' }];

    if (article.manufacturerName) {
      candidateClauses.push({ scope: 'MANUFACTURER', manufacturerName: article.manufacturerName });
    }
    if (article.supplierId) {
      candidateClauses.push({ scope: 'SUPPLIER', supplierId: article.supplierId });
    }
    if (article.categoryId) {
      candidateClauses.push({ scope: 'CATEGORY', categoryId: article.categoryId });
    }
    if (article.productGroup) {
      candidateClauses.push({ scope: 'PRODUCT_GROUP', productGroup: article.productGroup });
    }
    if (article._id) {
      candidateClauses.push({ scope: 'ARTICLE', articleId: article._id });
    }

    return CatalogMarkupRule.find({
      isActive: true,
      $and: [
        { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
        { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] },
        { $or: candidateClauses },
      ],
    })
      .sort({ priority: -1, scope: 1, createdAt: -1 })
      .lean();
  }

  async findActiveRules(now = new Date()) {
    return CatalogMarkupRule.find({
      isActive: true,
      $and: [
        { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
        { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] },
      ],
    })
      .sort({ priority: -1, scope: 1, createdAt: -1 })
      .lean();
  }
}

const catalogMarkupRuleRepository = new CatalogMarkupRuleRepository();
export default catalogMarkupRuleRepository;
