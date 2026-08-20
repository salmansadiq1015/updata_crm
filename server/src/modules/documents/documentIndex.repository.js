import DocumentIndex from './documentIndex.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  source: 'exact',
  origin: 'exact',
  documentType: 'exact',
  category: 'exact',
  status: 'exact',
  sourceRecordType: 'exact',
  sourceRecordId: 'objectId',
  customerId: 'objectId',
  projectId: 'objectId',
  jobId: 'objectId',
  employeeId: 'objectId',
  installationId: 'objectId',
  ownerUserId: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', '_id'];

class DocumentIndexRepository {
  async create(data) {
    const doc = new DocumentIndex(data);
    return doc.save();
  }

  async findById(id) {
    return DocumentIndex.findById(id).select('-__v').lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const sortField = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const { search, dateFrom, dateTo, ...restFilters } = filters;
    const filter = {
      ...buildFilter(restFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortField, sortOrder),
    };

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const queryText = `${search || ''}`.trim();
    if (queryText) {
      filter.$text = { $search: queryText };
    }

    const docs = await DocumentIndex.find(filter)
      .sort(buildCursorSort(sortField, sortOrder))
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortField);
  }

  async softDelete(id, deletedBy) {
    return DocumentIndex.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), deletedBy },
      { returnDocument: 'after' },
    ).lean();
  }
}

const documentIndexRepository = new DocumentIndexRepository();
export default documentIndexRepository;
