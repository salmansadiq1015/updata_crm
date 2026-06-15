import IghImportJob from './ighImportJob.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  type: 'exact',
  status: 'exact',
};

class IghImportJobRepository {
  async create(data) {
    const job = new IghImportJob(data);
    return job.save();
  }

  async findById(id) {
    return IghImportJob.findById(id).lean();
  }

  async findLatest() {
    return IghImportJob.findOne().sort({ createdAt: -1 }).lean();
  }

  async findRunning() {
    return IghImportJob.findOne({ status: 'RUNNING' }).lean();
  }

  async updateStatus(id, status, additionalData = {}) {
    return IghImportJob.findByIdAndUpdate(
      id,
      { status, ...additionalData },
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async updateById(id, data) {
    return IghImportJob.findByIdAndUpdate(
      id,
      data,
      { returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async appendLog(id, logText) {
    return IghImportJob.findByIdAndUpdate(
      id,
      { $set: { log: logText } },
      { returnDocument: 'after' },
    ).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await IghImportJob.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v -log')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }
}

const ighImportJobRepository = new IghImportJobRepository();
export default ighImportJobRepository;
