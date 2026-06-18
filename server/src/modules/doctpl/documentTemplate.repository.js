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

class DocumentTemplateRepository {
  async create(data) {
    const template = new DocumentTemplate(data);
    return template.save();
  }

  async findById(id) {
    return DocumentTemplate.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      isDeleted: { $ne: true },
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

  async updateById(id, data, expectedVersion = null) {
    const filter = expectedVersion
      ? { _id: id, currentVersion: expectedVersion, isDeleted: { $ne: true } }
      : { _id: id, isDeleted: { $ne: true } };
    return DocumentTemplate.findOneAndUpdate(
      filter,
      { ...data, $inc: { currentVersion: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async softDelete(id) {
    return DocumentTemplate.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
}

const documentTemplateRepository = new DocumentTemplateRepository();
export default documentTemplateRepository;
