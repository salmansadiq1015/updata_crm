import MaintenanceInterval from './maintenanceInterval.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  maintenanceType: 'exact',
};

class MaintenanceIntervalRepository {
  async create(data) {
    const interval = new MaintenanceInterval(data);
    return interval.save();
  }

  async findById(id) {
    return MaintenanceInterval.findById(id).lean();
  }

  async findByInstallationId(installationId) {
    return MaintenanceInterval.find({ installationId })
      .sort({ nextDueDate: 1 })
      .lean();
  }

  async updateById(id, data) {
    return MaintenanceInterval.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async deleteById(id) {
    return MaintenanceInterval.findByIdAndDelete(id).lean();
  }

  async findDue(limit = 500) {
    return MaintenanceInterval.find({
      maintenanceStatus: 'ok',
      nextDueDate: { $lte: new Date() },
    })
      .populate('installationId', 'installationNumber siteId status')
      .limit(limit)
      .lean();
  }

  async findOverdue(limit = 500) {
    return MaintenanceInterval.find({
      maintenanceStatus: 'due',
      nextDueDate: { $lte: new Date() },
    })
      .populate('installationId', 'installationNumber siteId status')
      .limit(limit)
      .lean();
  }

  async findDashboard() {
    const pipeline = [
      {
        $group: {
          _id: '$maintenanceStatus',
          count: { $sum: 1 },
        },
      },
    ];

    const results = await MaintenanceInterval.aggregate(pipeline);
    const totals = { total: 0, ok: 0, due: 0, overdue: 0, scheduled: 0 };

    for (const r of results) {
      totals[r._id] = r.count;
      totals.total += r.count;
    }

    return totals;
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'nextDueDate', sortOrder = 'asc', filters = {} }) {
    const filter = {
      ...buildFilter(filters, ALLOWED_FILTERS),
      ...buildCursorQuery(cursor, sortBy, sortOrder),
    };

    const sort = buildCursorSort(sortBy, sortOrder);

    const docs = await MaintenanceInterval.find(filter)
      .populate('installationId', 'installationNumber siteId status')
      .sort(sort)
      .limit(limit + 1)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, sortBy);
  }
}

const maintenanceIntervalRepository = new MaintenanceIntervalRepository();
export default maintenanceIntervalRepository;
