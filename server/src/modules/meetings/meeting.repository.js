import Meeting from './meeting.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';

const ALLOWED_SORT_FIELDS = ['startAt', 'endAt', 'createdAt', 'updatedAt', 'title', 'status', '_id'];

const POPULATE_FIELDS = [
  { path: 'participants.userId', select: 'firstName lastName email role' },
  { path: 'createdBy', select: 'firstName lastName email' },
  { path: 'updatedBy', select: 'firstName lastName email' },
  { path: 'projectId', select: 'name projectNumber status customerName' },
  { path: 'customerId', select: 'name customerNumber email phone' },
  { path: 'taskIds', select: 'title status priority assigneeId dueDate' },
  { path: 'decisions.ownerId', select: 'firstName lastName email' },
  { path: 'decisions.taskId', select: 'title status priority assigneeId dueDate' },
  { path: 'notes.createdBy', select: 'firstName lastName email' },
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function combineFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length > 0);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

function normalizeCursorFilter(filter, sortBy) {
  if (!filter || !['startAt', 'endAt', 'createdAt', 'updatedAt'].includes(sortBy)) return filter;
  if (filter.$or) {
    return {
      $or: filter.$or.map((clause) => {
        const next = { ...clause };
        if (next[sortBy] && typeof next[sortBy] === 'object') {
          const operator = Object.keys(next[sortBy])[0];
          next[sortBy] = { [operator]: new Date(next[sortBy][operator]) };
        } else if (next[sortBy]) {
          next[sortBy] = new Date(next[sortBy]);
        }
        return next;
      }),
    };
  }
  return filter;
}

class MeetingRepository {
  async create(data) {
    const meeting = new Meeting(data);
    return meeting.save();
  }

  async findById(id) {
    return Meeting.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findRawById(id) {
    return Meeting.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'startAt', sortOrder = 'asc', filters = {} }) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'startAt';
    const baseFilter = {};
    const now = new Date();

    if (filters.status && filters.status !== 'ALL') baseFilter.status = filters.status;
    if (filters.projectId) baseFilter.projectId = filters.projectId;
    if (filters.customerId) baseFilter.customerId = filters.customerId;
    if (filters.taskId) baseFilter.taskIds = filters.taskId;
    if (filters.participantId) baseFilter['participants.userId'] = filters.participantId;
    if (filters.responsibleId) {
      baseFilter.participants = { $elemMatch: { userId: filters.responsibleId, role: 'RESPONSIBLE' } };
    }

    if (filters.dateFrom || filters.dateTo) {
      baseFilter.startAt = {};
      if (filters.dateFrom) baseFilter.startAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) baseFilter.startAt.$lte = new Date(filters.dateTo);
    }

    if (filters.scope === 'upcoming') {
      baseFilter.endAt = { ...(baseFilter.endAt || {}), $gte: now };
      if (!filters.status || filters.status === 'ALL') {
        baseFilter.status = { $nin: ['CANCELLED', 'COMPLETED'] };
      }
    }

    if (filters.scope === 'past') {
      baseFilter.$or = [
        { endAt: { $lt: now } },
        { status: { $in: ['COMPLETED', 'CANCELLED'] } },
      ];
    }

    let searchFilter = {};
    if (filters.q) {
      const regex = { $regex: escapeRegex(filters.q), $options: 'i' };
      searchFilter = { $or: [{ title: regex }, { agenda: regex }, { description: regex }, { location: regex }] };
    }

    const cursorFilter = normalizeCursorFilter(buildCursorQuery(cursor, safeSortBy, sortOrder), safeSortBy);
    const filter = combineFilters(baseFilter, searchFilter, cursorFilter);
    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Meeting.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async updateById(id, data, { expectedVersion } = {}) {
    const filter = { _id: id, isDeleted: false };
    if (expectedVersion !== undefined && expectedVersion !== null) {
      filter.version = expectedVersion;
    }

    return Meeting.findOneAndUpdate(
      filter,
      { $set: data, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).populate(POPULATE_FIELDS).lean();
  }

  async softDelete(id, deletedBy) {
    return Meeting.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedBy: deletedBy,
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    ).lean();
  }
}

const meetingRepository = new MeetingRepository();
export default meetingRepository;
