import CatalogCategory from './catalogCategory.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  parentId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'sortOrder', 'code', '_id'];

class CatalogCategoryRepository {
  async create(data) {
    const category = new CatalogCategory(data);
    return category.save();
  }

  async findById(id) {
    return CatalogCategory.findById(id).lean();
  }

  async findByCode(code) {
    return CatalogCategory.findOne({ code }).lean();
  }

  async findByParentId(parentId) {
    return CatalogCategory.find({ parentId }).sort({ sortOrder: 1 }).lean();
  }

  async findRoots() {
    return CatalogCategory.find({ parentId: null }).sort({ sortOrder: 1 }).lean();
  }

  async findSelectOptions({ includeInactive = false } = {}) {
    const filter = includeInactive ? {} : { status: 'ACTIVE' };
    return CatalogCategory.find(filter)
      .sort({ name: 1, code: 1 })
      .select('_id code name parentId status ancestors')
      .lean();
  }

  async findSubtree(ancestorId) {
    return CatalogCategory.find({ ancestors: ancestorId }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await CatalogCategory.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data) {
    return CatalogCategory.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return CatalogCategory.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  async hasChildren(id) {
    const count = await CatalogCategory.countDocuments({ parentId: id });
    return count > 0;
  }

  async hasArticles(id) {
    // Lazy import to avoid circular dependencies
    const Article = (await import('./article.model.js')).default;
    const count = await Article.countDocuments({ categoryId: id, isDeleted: false });
    return count > 0;
  }

  async countArticlesByCategoryIds(ids) {
    if (!ids?.length) return new Map();
    const Article = (await import('./article.model.js')).default;
    const rows = await Article.aggregate([
      { $match: { categoryId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }
}

const catalogCategoryRepository = new CatalogCategoryRepository();
export default catalogCategoryRepository;
