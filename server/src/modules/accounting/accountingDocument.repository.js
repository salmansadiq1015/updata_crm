import AccountingDocument from './accountingDocument.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  documentType: 'exact',
  ocrStatus: 'exact',
  assignedTo: 'objectId',
  processingStatus: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'fileName', '_id'];

class AccountingDocumentRepository {
  async create(data) {
    const doc = new AccountingDocument(data);
    return doc.save();
  }

  async findById(id) {
    return AccountingDocument.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await AccountingDocument.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findByHash(fileHash) {
    return AccountingDocument.findOne({ fileHash }).lean();
  }
}

const accountingDocumentRepository = new AccountingDocumentRepository();
export default accountingDocumentRepository;
