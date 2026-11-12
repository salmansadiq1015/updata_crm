import Task from './task.model.js';
import User from '../auth/user.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
  decodeCursor,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

const ALLOWED_FILTERS = {
  listId: 'objectId',
  assigneeId: 'objectId',
  createdBy: 'objectId',
  status: 'exact',
  priority: 'exact',
  projectId: 'objectId',
  orderId: 'objectId',
  meetingId: 'objectId',
  siteId: 'objectId',
  departmentId: 'objectId',
  parentTaskId: 'objectId',
  dueFrom: 'dateFrom',
  dueTo: 'dateTo',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title', 'sortOrder', '_id'];
// Sort fields that may hold null. MongoDB sorts null before every date, and a
// range operator ($gt/$lt) never matches null, so the generic keyset condition
// silently drops the null (or the non-null) part of the result after page 1.
const NULLABLE_SORT_FIELDS = new Set(['dueDate']);
// Bound the assignee-name lookup behind free-text search.
const SEARCH_USER_LIMIT = 200;

/**
 * Keyset condition for "rows after this cursor", null-aware for nullable fields:
 * ascending puts nulls first, descending puts them last (MongoDB's order).
 */
function buildTaskCursorQuery(cursor, sortBy, sortOrder) {
  if (!cursor || !NULLABLE_SORT_FIELDS.has(sortBy)) return buildCursorQuery(cursor, sortBy, sortOrder);
  const decoded = decodeCursor(cursor);
  if (!decoded || !(sortBy in decoded)) return buildCursorQuery(cursor, sortBy, sortOrder);

  const desc = sortOrder === 'desc';
  const op = desc ? '$lt' : '$gt';
  const value = decoded[sortBy];
  if (value === null) {
    return desc
      ? { [sortBy]: null, _id: { $lt: decoded._id } }
      : { $or: [{ [sortBy]: { $ne: null } }, { [sortBy]: null, _id: { $gt: decoded._id } }] };
  }
  const clauses = [
    { [sortBy]: { [op]: value } },
    { [sortBy]: value, _id: { [op]: decoded._id } },
  ];
  if (desc) clauses.push({ [sortBy]: null });
  return { $or: clauses };
}

const POPULATE_FIELDS = [
  { path: 'assigneeId', select: 'firstName lastName email role' },
  { path: 'assigneeIds', select: 'firstName lastName email role' },
  { path: 'createdBy', select: 'firstName lastName email' },
  { path: 'projectId', select: 'name projectNumber customerName status' },
  { path: 'orderId', select: 'assignmentNumber title status priority' },
  { path: 'meetingId', select: 'title startAt status' },
  { path: 'siteId', select: 'name street postalCode city' },
  { path: 'departmentId', select: 'name code color icon' },
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

class TaskRepository {
  async create(data) {
    const task = new Task(data);
    return task.save();
  }

  async findChatContext(id) {
    return Task.findById(id)
      .select('title projectId assigneeId assigneeIds createdBy listId locked lockedBy poolHelperId')
      .lean();
  }

  async findById(id) {
    return Task.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    // Validate sort field
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    // Extract special filters before passing to buildFilter
    const { active, completedThisWeek, overdue, dueToday, hasParent, q, dueFrom, dueTo, createdById, inPool, accessUserId, accessibleListIds, ...standardFilters } = filters;

    // Map createdById to the actual field name
    if (createdById) {
      standardFilters.createdBy = createdById;
    }

    // Map date range filters to the dueDate field
    if (dueFrom) {
      standardFilters.dueFrom = dueFrom;
    }
    if (dueTo) {
      standardFilters.dueTo = dueTo;
    }

    // Build base filter from standard allowed filters
    const baseFilter = {
      ...buildFilter(standardFilters, {
        ...ALLOWED_FILTERS,
        dueFrom: 'dateFrom',
        dueTo: 'dateTo',
      }),
    };

    // Remap dueFrom/dueTo filter keys to dueDate
    if (baseFilter.dueFrom || baseFilter.dueTo) {
      baseFilter.dueDate = {};
      if (baseFilter.dueFrom) {
        baseFilter.dueDate.$gte = baseFilter.dueFrom.$gte;
        delete baseFilter.dueFrom;
      }
      if (baseFilter.dueTo) {
        baseFilter.dueDate.$lte = baseFilter.dueTo.$lte;
        delete baseFilter.dueTo;
      }
    }

    if (active === true || active === 'true') {
      baseFilter.status = { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] };
    }
    if (completedThisWeek === true || completedThisWeek === 'true') {
      const now = new Date();
      const mondayOffset = (now.getDay() + 6) % 7;
      baseFilter.status = 'COMPLETED';
      baseFilter.completedAt = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset) };
    }

    // Handle overdue filter
    if (overdue === true || overdue === 'true') {
      baseFilter.dueDate = { $lt: new Date() };
      baseFilter.status = { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] };
    }

    // Handle dueToday filter
    if (dueToday === true || dueToday === 'true') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      baseFilter.dueDate = { $gte: startOfDay, $lt: endOfDay };
    }

    // Handle pool filter (shared overdue pool view)
    if (inPool === true || inPool === 'true') {
      baseFilter.inPool = true;
    }

    // Handle hasParent filter
    if (hasParent === true || hasParent === 'true') {
      baseFilter.parentTaskId = { $ne: null };
    } else if (hasParent === false || hasParent === 'false') {
      baseFilter.parentTaskId = null;
    }

    // Handle text search: case-insensitive substring match on title/description
    // plus assignee name/email. ($text word-stem search couldn't match partial
    // words and never covered the assignee.)
    let searchFilter = {};
    if (q) {
      const regex = { $regex: escapeRegex(q), $options: 'i' };
      const tokens = String(q).trim().split(/\s+/).filter(Boolean);
      const matchedUsers = tokens.length
        ? await User.find({
            $and: tokens.map((token) => {
              const tokenRegex = { $regex: escapeRegex(token), $options: 'i' };
              return { $or: [{ firstName: tokenRegex }, { lastName: tokenRegex }, { email: tokenRegex }] };
            }),
          }).select('_id').limit(SEARCH_USER_LIMIT).lean()
        : [];
      const or = [{ title: regex }, { description: regex }];
      if (matchedUsers.length > 0) {
        const matchedIds = matchedUsers.map((u) => u._id);
        or.push({ assigneeId: { $in: matchedIds } });
        or.push({ assigneeIds: { $in: matchedIds } });
      }
      searchFilter = { $or: or };
    }

    // Central task management: every user sees all non-locked tasks. Locked
    // (confidential) tasks stay visible only to their owner
    // (creator/assignee/locker); admins bypass this filter entirely upstream.
    const accessFilter = accessUserId
      ? {
          $or: [
            { locked: { $ne: true } },
            { createdBy: accessUserId },
            { assigneeId: accessUserId },
            { assigneeIds: accessUserId },
            { lockedBy: accessUserId },
          ],
        }
      : {};

    const filter = combineFilters(baseFilter, searchFilter, buildTaskCursorQuery(cursor, safeSortBy, sortOrder), accessFilter);

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Task.find(filter)
      .sort(sort)
      .limit(limit + 1)
      .populate(POPULATE_FIELDS)
      .select('-__v')
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  async findByParentId(parentId) {
    return Task.find({ parentTaskId: parentId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async countByParentId(parentId) {
    return Task.countDocuments({ parentTaskId: parentId });
  }

  async findByListId(listId, { status } = {}) {
    const filter = { listId };
    if (status) filter.status = status;
    return Task.find(filter)
      .sort({ sortOrder: 1 })
      .lean();
  }

  async findByProjectId(projectId) {
    return Task.find({ projectId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async findByOrderId(orderId) {
    return Task.find({ orderId })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async countByListId(listId, { status } = {}) {
    const filter = { listId };
    if (status) filter.status = status;
    return Task.countDocuments(filter);
  }

  async countByProjectId(projectId, { status } = {}) {
    const filter = { projectId };
    if (status) filter.status = status;
    return Task.countDocuments(filter);
  }

  async countByAssigneeId(assigneeId, { status } = {}) {
    const filter = { assigneeId };
    if (status) filter.status = status;
    return Task.countDocuments(filter);
  }

  async findOverdue() {
    return Task.find({
      dueDate: { $lt: new Date() },
      status: { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
    })
      .sort({ dueDate: 1 })
      .lean();
  }

  async findDueToday(userId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return Task.find({
      assigneeId: userId,
      dueDate: { $gte: startOfDay, $lt: endOfDay },
    })
      .sort({ sortOrder: 1 })
      .lean();
  }

  async findRecentlyCompleted(userId, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return Task.find({
      completedBy: userId,
      status: 'COMPLETED',
      completedAt: { $gte: since },
    })
      .sort({ completedAt: -1 })
      .lean();
  }

  async findChangedSince(userId, since, { accessibleListIds = [] } = {}) {
    return Task.find({
      $or: [
        { assigneeId: userId },
        { createdBy: userId },
        ...(Array.isArray(accessibleListIds) && accessibleListIds.length > 0
          ? [{ listId: { $in: accessibleListIds } }]
          : []),
      ],
      updatedAt: { $gt: new Date(since) },
    })
      .setOptions({ includeDeleted: true })
      .sort({ updatedAt: 1 })
      .lean();
  }

  async updateById(id, data, { expectedVersion } = {}) {
    const filter = { _id: id };
    if (expectedVersion !== undefined && expectedVersion !== null) {
      filter.version = expectedVersion;
    }

    return Task.findOneAndUpdate(filter, {
      $set: data,
      $inc: { version: 1 },
    }, {
      returnDocument: 'after',
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Task.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  // Active, non-locked, not-yet-pooled tasks whose due date is on/before the
  // working-day cutoff — candidates for the shared overdue pool.
  async findPoolEligible(cutoffDate) {
    return Task.find({
      isDeleted: false,
      dueDate: { $ne: null, $lte: cutoffDate },
      status: { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
      locked: { $ne: true },
      inPool: { $ne: true },
    })
      .sort({ dueDate: 1 })
      .lean();
  }

  async markPooled(taskIds, pooledAt) {
    if (!taskIds.length) return 0;
    const result = await Task.updateMany(
      { _id: { $in: taskIds }, isDeleted: false },
      { $set: { inPool: true, pooledAt } },
    );
    return result.modifiedCount;
  }

  async findLockedIds(taskIds) {
    const docs = await Task.find({ _id: { $in: taskIds }, locked: true, isDeleted: false })
      .select('_id')
      .lean();
    return docs.map((doc) => String(doc._id));
  }

  async bulkUpdate(taskIds, data) {
    const result = await Task.updateMany(
      { _id: { $in: taskIds }, isDeleted: false },
      { $set: data, $inc: { version: 1 } },
      { runValidators: true },
    );
    return result.modifiedCount;
  }

  async batchPatch(updates) {
    const operations = updates.map(({ id, patch }) => ({
      updateOne: {
        filter: {
          _id: id,
          isDeleted: false,
          ...(patch.expectedVersion !== undefined ? { version: patch.expectedVersion } : {}),
        },
        update: {
          $set: patch.data,
          $inc: { version: 1 },
        },
        runValidators: true,
      },
    }));

    if (operations.length === 0) return { modifiedCount: 0, tasks: [] };
    const result = await Task.bulkWrite(operations, { ordered: true });
    const tasks = await Task.find({ _id: { $in: updates.map(({ id }) => id) }, isDeleted: false }).lean();
    return { modifiedCount: result.modifiedCount, tasks };
  }

  async moveTasksToList(fromListId, toListId) {
    const result = await Task.updateMany(
      { listId: fromListId, isDeleted: false },
      { $set: { listId: toListId } },
    );
    return result.modifiedCount;
  }

  async getProjectTaskSummary(projectId) {
    return Task.aggregate([
      { $match: { projectId, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
  }

  async getCrossProjectReport(projectIds) {
    return Task.aggregate([
      {
        $match: {
          projectId: { $in: projectIds },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: { projectId: '$projectId', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.projectId',
          statuses: {
            $push: { status: '$_id.status', count: '$count' },
          },
          total: { $sum: '$count' },
        },
      },
      {
        $addFields: {
          completed: {
            $reduce: {
              input: {
                $filter: {
                  input: '$statuses',
                  cond: { $eq: ['$$this.status', 'COMPLETED'] },
                },
              },
              initialValue: 0,
              in: { $add: ['$$value', '$$this.count'] },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          projectId: '$_id',
          statuses: 1,
          total: 1,
          completionRate: {
            $cond: {
              if: { $eq: ['$total', 0] },
              then: 0,
              else: { $round: [{ $multiply: [{ $divide: ['$completed', '$total'] }, 100] }, 2] },
            },
          },
        },
      },
    ]);
  }
}

const taskRepository = new TaskRepository();
export default taskRepository;
