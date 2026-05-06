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

  async findSubtree(ancestorId) {
    return CatalogCategory.find({ ancestors: ancestorId }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await CatalogCategory.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
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
}

const catalogCategoryRepository = new CatalogCategoryRepository();
export default catalogCategoryRepository;
