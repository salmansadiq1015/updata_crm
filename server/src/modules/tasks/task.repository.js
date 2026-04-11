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
  parentTaskId: 'objectId',
  dueFrom: 'dateFrom',
  dueTo: 'dateTo',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title', 'sortOrder', '_id'];

class TaskRepository {
  async create(data) {
    const task = new Task(data);
    return task.save();
  }

  async findById(id) {
    return Task.findById(id).lean();
  }

  async findWithCursor({ cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', filters = {} }) {
    // Validate sort field
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    // Extract special filters before passing to buildFilter
    const { overdue, dueToday, hasParent, q, dueFrom, dueTo, createdById, ...standardFilters } = filters;

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
    const filter = {
      ...buildFilter(standardFilters, {
        ...ALLOWED_FILTERS,
        dueFrom: 'dateFrom',
        dueTo: 'dateTo',
      }),
      ...buildCursorQuery(cursor, safeSortBy, sortOrder),
    };

    // Remap dueFrom/dueTo filter keys to dueDate
    if (filter.dueFrom || filter.dueTo) {
      filter.dueDate = {};
      if (filter.dueFrom) {
        filter.dueDate.$gte = filter.dueFrom.$gte;
        delete filter.dueFrom;
      }
      if (filter.dueTo) {
        filter.dueDate.$lte = filter.dueTo.$lte;
        delete filter.dueTo;
      }
    }

    // Handle overdue filter
    if (overdue === true || overdue === 'true') {
      filter.dueDate = { $lt: new Date() };
      filter.status = { $in: ['OPEN', 'IN_PROGRESS'] };
    }

    // Handle dueToday filter
    if (dueToday === true || dueToday === 'true') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      filter.dueDate = { $gte: startOfDay, $lt: endOfDay };
    }

    // Handle hasParent filter
    if (hasParent === true || hasParent === 'true') {
      filter.parentTaskId = { $ne: null };
    } else if (hasParent === false || hasParent === 'false') {
      filter.parentTaskId = null;
    }

    // Handle text search
    if (q) {
      filter.$text = { $search: q };
    }

    const sort = buildCursorSort(safeSortBy, sortOrder);

    const docs = await Task.find(filter)
      .sort(sort)
      .limit(limit + 1)
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
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
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

  async findChangedSince(userId, since) {
    return Task.find({
      $or: [
        { assigneeId: userId },
        { createdBy: userId },
      ],
      updatedAt: { $gt: new Date(since) },
    })
      .sort({ updatedAt: 1 })
      .lean();
  }

  async updateById(id, data) {
    return Task.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
  }

  async softDelete(id) {
    return Task.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true },
    );
  }

  async bulkUpdate(taskIds, data) {
    const result = await Task.updateMany(
      { _id: { $in: taskIds }, isDeleted: false },
      { $set: data },
      { runValidators: true },
    );
    return result.modifiedCount;
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
