import EmailRecord from './emailRecord.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  sourceModule: 'exact',
  sourceRecordId: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'sentAt', '_id'];

class EmailRecordRepository {
  async create(data) {
    const record = new EmailRecord(data);
    return record.save();
  }

  async findById(id) {
    return EmailRecord.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await EmailRecord.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }

  async findBySource(sourceModule, sourceRecordId) {
    return EmailRecord.find({ sourceModule, sourceRecordId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async updateStatus(id, status, details = {}) {
    const update = { status, ...details };
    return EmailRecord.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' }).lean();
  }
}

const emailRecordRepository = new EmailRecordRepository();
export default emailRecordRepository;
