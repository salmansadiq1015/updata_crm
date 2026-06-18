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
  sourceCustomerId: 'objectId',
  sourceProjectId: 'objectId',
};

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
    const { search, ...restFilters } = filters;
    const filter = {
      ...buildFilter(restFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    const queryText = `${search || ''}`.trim();
    if (queryText) {
      const regex = new RegExp(escapeRegex(queryText), 'i');
      filter.$or = [
        { documentType: regex },
        { sourceModule: regex },
        { fileName: regex },
        { 'metadata.customerName': regex },
        { 'metadata.projectName': regex },
      ];
    }

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

function escapeRegex(value) {
  return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const generatedDocumentRepository = new GeneratedDocumentRepository();
export default generatedDocumentRepository;
