import MaintenanceInterval from './maintenanceInterval.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  maintenanceType: 'exact',
  maintenanceStatus: 'exact',
};

class MaintenanceIntervalRepository {
  /**
   * Resolve the ids of all active (non-decommissioned, non-deleted) installations.
   * Used to scope "active maintenance" queries so intervals belonging to a
   * decommissioned installation are never counted (CRM-005 AC-4). Lazy import to
   * avoid a circular dependency between the CRM repositories.
   */
  async _getActiveInstallationIds() {
    const Installation = (await import('./installation.model.js')).default;
    const installations = await Installation.find({ status: 'active' })
      .select('_id')
      .lean();
    return installations.map((installation) => installation._id);
  }

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

  /**
   * All maintenance intervals for every installation of a site, populated with
   * the owning installation so the object-level Wartungen tab can group/label
   * them. Sorted by next due date so the soonest maintenance surfaces first.
   */
  async findBySiteId(siteId) {
    const Installation = (await import('./installation.model.js')).default;
    const installations = await Installation.find({ siteId }).select('_id').lean();
    const ids = installations.map((installation) => installation._id);
    if (!ids.length) return [];
    return MaintenanceInterval.find({ installationId: { $in: ids } })
      .populate('installationId', 'installationNumber type manufacturer model status')
      .sort({ nextDueDate: 1 })
      .lean();
  }

  async updateById(id, data) {
    return MaintenanceInterval.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async deleteById(id) {
    return MaintenanceInterval.findByIdAndDelete(id).lean();
  }

  async findDue(limit = 500) {
    const activeIds = await this._getActiveInstallationIds();
    return MaintenanceInterval.find({
      maintenanceStatus: 'ok',
      nextDueDate: { $lte: new Date() },
      installationId: { $in: activeIds },
    })
      .populate('installationId', 'installationNumber siteId status')
      .limit(limit)
      .lean();
  }

  async findOverdue(limit = 500) {
    const activeIds = await this._getActiveInstallationIds();
    return MaintenanceInterval.find({
      maintenanceStatus: 'due',
      nextDueDate: { $lte: new Date() },
      installationId: { $in: activeIds },
    })
      .populate('installationId', 'installationNumber siteId status')
      .limit(limit)
      .lean();
  }

  async findDashboard() {
    const activeIds = await this._getActiveInstallationIds();
    const pipeline = [
      {
        $match: { installationId: { $in: activeIds } },
      },
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

  async findWithCursor({
    cursor,
    limit = 25,
    sortBy = 'nextDueDate',
    sortOrder = 'asc',
    filters = {},
    activeOnly = true,
  }) {
    const activeFilter = {};
    if (activeOnly) {
      activeFilter.installationId = { $in: await this._getActiveInstallationIds() };
    }

    const filter = {
      ...activeFilter,
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
