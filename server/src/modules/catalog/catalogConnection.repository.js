import CatalogConnection from './catalogConnection.model.js';
import CatalogSyncLog from './catalogSyncLog.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  type: 'exact',
  isEnabled: 'boolean',
  isPreferred: 'boolean',
  lastSyncStatus: 'exact',
  supplierId: 'objectId',
  manufacturerName: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'providerKey', 'lastSyncedAt', 'preferredRank', '_id'];

const POPULATE_FIELDS = [
  { path: 'supplierId', select: 'name customerNumber email phone' },
  { path: 'defaultCategoryId', select: 'code name' },
];

class CatalogConnectionRepository {
  async create(data) {
    const connection = new CatalogConnection(data);
    return connection.save();
  }

  async findById(id) {
    return CatalogConnection.findById(id).populate(POPULATE_FIELDS).lean();
  }

  async findByProviderKey(providerKey) {
    return CatalogConnection.findOne({ providerKey }).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {}, search }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { providerKey: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { manufacturerName: { $regex: search, $options: 'i' } },
      ];
    }

    const docs = await CatalogConnection.find(filter)
      .sort(buildCursorSort(safeSortBy, sortOrder))
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data) {
    return CatalogConnection.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).populate(POPULATE_FIELDS).lean();
  }

  async updateSyncState(id, data) {
    return CatalogConnection.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return CatalogConnection.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date(), isEnabled: false, lastSyncStatus: 'DISABLED' },
      { returnDocument: 'after' },
    ).lean();
  }

  async findSyncCandidates() {
    return CatalogConnection.find({
      isEnabled: true,
      syncSchedule: { $nin: ['', null, 'manual', 'MANUAL'] },
    }).lean();
  }

  async createSyncLog(data) {
    return CatalogSyncLog.create(data);
  }

  async updateSyncLog(id, data) {
    return CatalogSyncLog.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean();
  }

  async findSyncLogs(connectionId, { limit = 25 } = {}) {
    return CatalogSyncLog.find({ connectionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

const catalogConnectionRepository = new CatalogConnectionRepository();
export default catalogConnectionRepository;
