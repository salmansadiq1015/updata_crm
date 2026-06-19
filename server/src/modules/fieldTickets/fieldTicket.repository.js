import Counter from '../crm/counter.model.js';
import FieldTicket from './fieldTicket.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  status: 'exact',
  priority: 'exact',
  type: 'exact',
  assignedTo: 'objectId',
  teamId: 'objectId',
  customerId: 'objectId',
  projectId: 'objectId',
  assetId: 'objectId',
  jobId: 'objectId',
  orderId: 'objectId',
  siteId: 'objectId',
  installationId: 'objectId',
  maintenanceId: 'objectId',
  createdBy: 'objectId',
  escalated: 'boolean',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueAt', 'priority', 'status', 'ticketNumber', '_id'];

const POPULATE_FIELDS = [
  { path: 'assignedTo', select: 'firstName lastName email department position' },
  { path: 'createdBy', select: 'firstName lastName email' },
  { path: 'updatedBy', select: 'firstName lastName email' },
  { path: 'completedBy', select: 'firstName lastName email' },
  { path: 'comments.authorId', select: 'firstName lastName email' },
  { path: 'activity.actorId', select: 'firstName lastName email' },
  { path: 'attachments.uploadedBy', select: 'firstName lastName email' },
];

function combineFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length > 0);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

function mapDateRange(baseFilter, filters) {
  if (filters.dueFrom || filters.dueTo) {
    baseFilter.dueAt = {};
    if (filters.dueFrom) baseFilter.dueAt.$gte = new Date(filters.dueFrom);
    if (filters.dueTo) baseFilter.dueAt.$lte = new Date(filters.dueTo);
  }
}

function buildScopedFilter(filters) {
  const {
    q,
    overdue,
    dueFrom,
    dueTo,
    accessUserId,
    escalated,
    ...standardFilters
  } = filters;

  const baseFilter = {
    ...buildFilter(standardFilters, ALLOWED_FILTERS),
  };

  mapDateRange(baseFilter, { dueFrom, dueTo });

  if (q) {
    baseFilter.$text = { $search: q };
  }

  if (overdue === true || overdue === 'true') {
    baseFilter.dueAt = { $lt: new Date() };
    baseFilter.status = { $in: ['OPEN', 'IN_PROGRESS', 'PENDING'] };
  }

  if (escalated !== undefined && escalated !== '') {
    baseFilter.escalated = escalated === true || escalated === 'true' || escalated === '1';
  }

  const accessFilter = accessUserId
    ? {
        $or: [
          { assignedTo: accessUserId },
          { createdBy: accessUserId },
        ],
      }
    : {};

  return combineFilters(baseFilter, accessFilter);
}

class FieldTicketRepository {
  async generateTicketNumber() {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'field_ticket_number' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return `FT-${String(counter.seq).padStart(6, '0')}`;
  }

  async create(data) {
    const ticket = new FieldTicket(data);
    return ticket.save();
  }

  async findById(id, options = {}) {
    return FieldTicket.findById(id, null, options)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const scopedFilter = buildScopedFilter(filters);
    const cursorFilter = buildCursorQuery(cursor, safeSortBy, sortOrder);
    const filter = combineFilters(scopedFilter, cursorFilter);
    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await FieldTicket.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, { set = {}, push = {} } = {}) {
    const update = {};
    if (Object.keys(set).length > 0) update.$set = set;

    for (const [field, value] of Object.entries(push)) {
      if (value === undefined || value === null) continue;
      if (!update.$push) update.$push = {};
      update.$push[field] = Array.isArray(value) ? { $each: value } : value;
    }

    if (Object.keys(update).length === 0) return this.findById(id);

    return FieldTicket.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();
  }

  async softDelete(id, userId) {
    return this.updateById(id, {
      set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy: userId,
      },
      push: {
        activity: {
          type: 'DELETED',
          message: 'Ticket deleted',
          actorId: userId,
          at: new Date(),
        },
      },
    });
  }

  async findOverdueOpen(now = new Date(), limit = 200) {
    return FieldTicket.find({
      dueAt: { $lt: now },
      status: { $in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
      escalated: false,
      isDeleted: false,
    })
      .sort({ priority: 1, dueAt: 1 })
      .limit(limit)
      .select('-__v')
      .lean();
  }

  async getSummary(filters = {}) {
    const match = {
      isDeleted: false,
      ...buildScopedFilter(filters),
    };

    const now = new Date();
    const [byStatus, byPriority, overdueCount, escalatedCount, totalCount] = await Promise.all([
      FieldTicket.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      FieldTicket.aggregate([
        { $match: match },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      FieldTicket.countDocuments({
        ...match,
        dueAt: { $lt: now },
        status: { $in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
      }),
      FieldTicket.countDocuments({ ...match, escalated: true }),
      FieldTicket.countDocuments(match),
    ]);

    return {
      total: totalCount,
      overdue: overdueCount,
      escalated: escalatedCount,
      byStatus: Object.fromEntries(byStatus.map((row) => [row._id, row.count])),
      byPriority: Object.fromEntries(byPriority.map((row) => [row._id, row.count])),
    };
  }
}

const fieldTicketRepository = new FieldTicketRepository();
export default fieldTicketRepository;
