import Task from './task.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
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
  parentTaskId: 'objectId',
  dueFrom: 'dateFrom',
  dueTo: 'dateTo',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title', 'sortOrder', '_id'];

const POPULATE_FIELDS = [
  { path: 'assigneeId', select: 'firstName lastName email role' },
  { path: 'createdBy', select: 'firstName lastName email' },
  { path: 'projectId', select: 'name projectNumber customerName status' },
  { path: 'orderId', select: 'assignmentNumber title status priority' },
  { path: 'meetingId', select: 'title startAt status' },
];

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

  async findById(id) {
    return Task.findById(id)
      .populate(POPULATE_FIELDS)
      .lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    // Validate sort field
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    // Extract special filters before passing to buildFilter
    const { overdue, dueToday, hasParent, q, dueFrom, dueTo, createdById, accessUserId, accessibleListIds, ...standardFilters } = filters;

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

    // Handle hasParent filter
    if (hasParent === true || hasParent === 'true') {
      baseFilter.parentTaskId = { $ne: null };
    } else if (hasParent === false || hasParent === 'false') {
      baseFilter.parentTaskId = null;
    }

    // Handle text search
    if (q) {
      baseFilter.$text = { $search: q };
    }

    // Owners (creator/assignee/locker) always see their own tasks, including
    // locked ones. List-based visibility (owned/group lists) excludes locked
    // tasks so they stay confidential to their owner.
    const accessFilter = accessUserId
      ? {
          $or: [
            { createdBy: accessUserId },
            { assigneeId: accessUserId },
            { lockedBy: accessUserId },
            ...(Array.isArray(accessibleListIds) && accessibleListIds.length > 0
              ? [{ listId: { $in: accessibleListIds }, locked: { $ne: true } }]
              : []),
          ],
        }
      : {};

    const filter = combineFilters(baseFilter, buildCursorQuery(cursor, safeSortBy, sortOrder), accessFilter);

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
