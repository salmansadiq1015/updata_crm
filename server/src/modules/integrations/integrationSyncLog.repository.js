import IntegrationSyncLog from './integrationSyncLog.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  integrationKey: 'exact',
  syncType: 'exact',
  status: 'exact',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
};

class IntegrationSyncLogRepository {
  async create(data) {
    const log = new IntegrationSyncLog(data);
    return log.save();
  }

  async findById(id) {
    return IntegrationSyncLog.findById(id).lean();
  }

  async findByIntegrationKey(integrationKey, { limit = 10 } = {}) {
    return IntegrationSyncLog.find({ integrationKey })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async findRunning(integrationKey) {
    return IntegrationSyncLog.findOne({ integrationKey, status: 'running' })
      .sort({ startedAt: -1 })
      .lean();
  }

  async updateById(id, data) {
    return IntegrationSyncLog.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const mappedFilters = {};
    if (filters.integrationKey) mappedFilters.integrationKey = filters.integrationKey;
    if (filters.syncType) mappedFilters.syncType = filters.syncType;
    if (filters.status) mappedFilters.status = filters.status;
    if (filters.dateFrom) mappedFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) mappedFilters.dateTo = filters.dateTo;

    const filter = {
      ...buildFilter(mappedFilters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    // Remap dateFrom/dateTo to createdAt field
    if (filter.dateFrom || filter.dateTo) {
      filter.createdAt = filter.createdAt || {};
      if (filter.dateFrom) {
        filter.createdAt.$gte = filter.dateFrom.$gte || filter.dateFrom;
        delete filter.dateFrom;
      }
      if (filter.dateTo) {
        filter.createdAt.$lte = filter.dateTo.$lte || filter.dateTo;
        delete filter.dateTo;
      }
    }

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await IntegrationSyncLog.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }
}

const integrationSyncLogRepository = new IntegrationSyncLogRepository();
export default integrationSyncLogRepository;
