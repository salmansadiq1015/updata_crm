import SupportTicket from './supportTicket.model.js';
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
  submittedBy: 'objectId',
  assignedTo: 'objectId',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber', '_id'];

const POPULATE_FIELDS = [
  { path: 'submittedBy', select: 'firstName lastName email' },
  { path: 'assignedTo', select: 'firstName lastName email' },
  { path: 'updatedBy', select: 'firstName lastName email' },
  { path: 'resolvedBy', select: 'firstName lastName email' },
  { path: 'attachments.uploadedBy', select: 'firstName lastName email' },
];

class SupportTicketRepository {
  async list(filters = {}) {
    const { q, ...standardFilters } = filters;
    const baseFilter = buildFilter(standardFilters, ALLOWED_FILTERS);

    if (q) {
      baseFilter.$text = { $search: q };
    }

    const sortField = filters.sortBy || 'createdAt';
    const sortDir = filters.sortDir || 'desc';

    if (!ALLOWED_SORT_FIELDS.includes(sortField)) {
      throw new Error(`Invalid sort field: ${sortField}`);
    }

    const cursorFilter = buildCursorQuery(filters, sortField, sortDir);
    const combinedFilter = cursorFilter && Object.keys(cursorFilter).length > 0
      ? { $and: [baseFilter, cursorFilter].filter(Boolean) }
      : baseFilter;

    const sort = buildCursorSort(sortField, sortDir);
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 25, 1), 100);

    const [docs, total] = await Promise.all([
      SupportTicket.find(combinedFilter)
        .sort(sort)
        .limit(limit + 1)
        .populate(POPULATE_FIELDS)
        .lean(),
      SupportTicket.countDocuments(baseFilter),
    ]);

    return buildCursorResponse(docs, limit, total, sortField);
  }

  async myTickets(userId, filters = {}) {
    return this.list({ ...filters, submittedBy: userId });
  }

  async findById(id) {
    return SupportTicket.findById(id).populate(POPULATE_FIELDS).lean();
  }

  async create(data) {
    const ticket = new SupportTicket(data);
    await ticket.save();
    return ticket.populate(POPULATE_FIELDS);
  }

  async update(id, patch) {
    return SupportTicket.findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after', runValidators: true })
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async softDelete(id, userId) {
    return SupportTicket.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId } },
      { returnDocument: 'after' },
    ).lean();
  }

  async stats() {
    const [byStatus, byType, byPriority] = await Promise.all([
      SupportTicket.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      SupportTicket.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      SupportTicket.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    ]);

    const toMap = (arr) => arr.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});
    return { byStatus: toMap(byStatus), byType: toMap(byType), byPriority: toMap(byPriority) };
  }

  async nextTicketNumber() {
    const last = await SupportTicket.findOne({}, { ticketNumber: 1 })
      .sort({ createdAt: -1 })
      .lean();
    const seq = last ? parseInt(last.ticketNumber.replace('SUP-', ''), 10) + 1 : 1;
    return `SUP-${String(seq).padStart(5, '0')}`;
  }
}

const supportTicketRepository = new SupportTicketRepository();
export default supportTicketRepository;
