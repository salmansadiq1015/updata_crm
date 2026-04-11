import DocumentTemplate from './documentTemplate.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  templateType: 'exact',
  isActive: 'boolean',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'templateType', '_id'];

class DocumentTemplateRepository {
  async create(data) {
    const template = new DocumentTemplate(data);
    return template.save();
  }

  async findById(id) {
    return DocumentTemplate.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await DocumentTemplate.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async updateById(id, data) {
    return DocumentTemplate.findByIdAndUpdate(
      id,
      { ...data, $inc: { currentVersion: 1 } },
      { new: true, runValidators: true },
    ).lean();
  }

  async softDelete(id) {
    return DocumentTemplate.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }
}

const documentTemplateRepository = new DocumentTemplateRepository();
export default documentTemplateRepository;
