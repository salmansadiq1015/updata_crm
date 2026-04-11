import GeneratedDocument from './generatedDocument.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  sourceModule: 'exact',
  sourceRecordId: 'exact',
  documentType: 'exact',
};

const ALLOWED_SORT_FIELDS = ['generatedAt', '_id'];

class GeneratedDocumentRepository {
  async create(data) {
    const doc = new GeneratedDocument(data);
    return doc.save();
  }

  async findById(id) {
    return GeneratedDocument.findById(id).lean();
  }

  async findBySource(sourceModule, sourceRecordId) {
    return GeneratedDocument.find({ sourceModule, sourceRecordId })
      .sort({ generatedAt: -1 })
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'generatedAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await GeneratedDocument.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async deleteById(id) {
    return GeneratedDocument.findByIdAndDelete(id);
  }
}

const generatedDocumentRepository = new GeneratedDocumentRepository();
export default generatedDocumentRepository;
