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
  linkedRecordType: 'exact',
  linkedRecordId: 'objectId',
};

class AccountingDocumentRepository {
  async create(data) {
    const doc = new AccountingDocument(data);
    return doc.save();
  }

  async findById(id, options = {}) {
    return AccountingDocument.findById(id)
      .session(options.session || null)
      .lean();
  }

  async findByIds(ids, options = {}) {
    return AccountingDocument.find({ _id: { $in: ids } })
      .session(options.session || null)
      .lean();
  }

  async updateById(id, data, options = {}) {
    return AccountingDocument.findByIdAndUpdate(
      id,
      data,
      { returnDocument: 'after', runValidators: true, session: options.session },
    ).lean();
  }

  async assignById(id, { assignedTo, assignedBy, note = '', reason = 'MANUAL' }, options = {}) {
    const assignedAt = new Date();
    return AccountingDocument.findByIdAndUpdate(
      id,
      {
        $set: {
          assignedTo,
          assignedAt,
          assignedBy,
        },
        $push: {
          assignmentHistory: {
            assignedTo,
            assignedBy,
            assignedAt,
            note,
            reason,
          },
        },
      },
      { returnDocument: 'after', runValidators: true, session: options.session },
    ).lean();
  }

  async bulkAssign(ids, { assignedTo, assignedBy, note = '', reason = 'BULK' }, options = {}) {
    const assignedAt = new Date();
    return AccountingDocument.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      {
        $set: {
          assignedTo,
          assignedAt,
          assignedBy,
        },
        $push: {
          assignmentHistory: {
            assignedTo,
            assignedBy,
            assignedAt,
            note,
            reason,
          },
        },
      },
      { runValidators: true, session: options.session },
    );
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };
    delete filter.linkedRecordType;
    delete filter.linkedRecordId;
    if (filters.linkedRecordType || filters.linkedRecordId) {
      filter.linkedRecords = {
        $elemMatch: {
          ...(filters.linkedRecordType ? { recordType: filters.linkedRecordType } : {}),
          ...(filters.linkedRecordId ? { recordId: filters.linkedRecordId } : {}),
        },
      };
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const query = AccountingDocument.find(filter);
    if (search) query.select({ score: { $meta: 'textScore' }, __v: 0 });
    else query.select('-__v');

    const docs = await query
      .sort(sort)
      .limit(limit + 1)
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findByHash(fileHash) {
    return AccountingDocument.findOne({ fileHash }).lean();
  }

  async softDelete(id, userId) {
    return AccountingDocument.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }
}

const accountingDocumentRepository = new AccountingDocumentRepository();
export default accountingDocumentRepository;
