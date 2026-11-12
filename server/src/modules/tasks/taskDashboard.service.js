import taskRepository from './task.repository.js';
import taskAccessService from './taskAccess.service.js';
import taskCache from './taskCache.js';
import logger from '../../shared/logger/index.js';

const DASHBOARD_TTL = { l1Ttl: 30, l2Ttl: 60 };
const ACTIVE_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];

function countStatus(statuses = [], status) {
  const entry = statuses.find((item) => item.status === status);
  return entry ? entry.count : 0;
}

class TaskDashboardService {
  async getDashboard(userId, { projectId, orderId, upcomingDays = 7 } = {}) {
    // Cached under the task write generation: completing/creating a task (from any
    // module) refreshes the tiles at once instead of after the TTL.
    const scope = { userId: String(userId), projectId: projectId || null, orderId: orderId || null, upcomingDays };

    return taskCache.getOrSet(
      'dashboard',
      scope,
      async () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const upcomingLimit = Math.min(Number(upcomingDays) || 7, 30);
        const upcomingEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + upcomingLimit);

        const Task = (await import('./task.model.js')).default;
        const contextFilter = {
          ...(projectId ? { projectId } : {}),
          ...(orderId ? { orderId } : {}),
        };

        const [overdue, dueToday, upcoming, recentlyCompleted] = await Promise.all([
          Task.find({
            assigneeId: userId,
            ...contextFilter,
            dueDate: { $lt: now },
            status: { $in: ACTIVE_TASK_STATUSES },
            isDeleted: false,
          })
            .sort({ dueDate: 1, _id: 1 })
            .limit(20)
            .lean(),

          Task.find({
            assigneeId: userId,
            ...contextFilter,
            dueDate: { $gte: startOfDay, $lt: endOfDay },
            status: { $in: ACTIVE_TASK_STATUSES },
            isDeleted: false,
          })
            .sort({ dueDate: 1, _id: 1 })
            .lean(),

          Task.find({
            assigneeId: userId,
            ...contextFilter,
            dueDate: { $gte: endOfDay, $lte: upcomingEnd },
            status: { $in: ACTIVE_TASK_STATUSES },
            isDeleted: false,
          })
            .sort({ dueDate: 1, _id: 1 })
            .limit(20)
            .lean(),

          Task.find({
            completedBy: userId,
            ...contextFilter,
            status: 'COMPLETED',
            completedAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            isDeleted: false,
          })
            .sort({ completedAt: -1, _id: -1 })
            .limit(10)
            .lean(),
        ]);

        return { overdue, dueToday, upcoming, recentlyCompleted };
      },
      DASHBOARD_TTL,
    );
  }

  async getStats(userId, { projectId, orderId } = {}) {
    const scope = { userId: String(userId), projectId: projectId || null, orderId: orderId || null };

    // Four index-only counts (COUNT_SCAN / covered IXSCAN on the assignee indexes):
    // measured faster than one $group pass, which must FETCH every task of the user.
    return taskCache.getOrSet(
      'stats',
      scope,
      async () => {
        const Task = (await import('./task.model.js')).default;
        const now = new Date();
        const contextFilter = {
          ...(projectId ? { projectId } : {}),
          ...(orderId ? { orderId } : {}),
        };

        // Calculate Monday of current week
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

        const [totalOpen, completedThisWeek, overdueCount, totalTasks] = await Promise.all([
          Task.countDocuments({
            assigneeId: userId,
            ...contextFilter,
            status: { $in: ACTIVE_TASK_STATUSES },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
            ...contextFilter,
            status: 'COMPLETED',
            completedAt: { $gte: monday },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
            ...contextFilter,
            dueDate: { $lt: now },
            status: { $in: ACTIVE_TASK_STATUSES },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
            ...contextFilter,
            isDeleted: false,
          }),
        ]);

        return { totalOpen, completedThisWeek, overdueCount, totalTasks };
      },
      DASHBOARD_TTL,
    );
  }

  async getProjectTasks(projectId, queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...rest } = queryParams;
    return taskRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters: { projectId, ...rest },
    });
  }

  async getProjectTaskSummary(projectId) {
    const statusAgg = await taskRepository.getProjectTaskSummary(projectId);

    const counts = { OPEN: 0, IN_PROGRESS: 0, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 };
    let total = 0;

    for (const item of statusAgg) {
      counts[item.status] = item.count;
      total += item.count;
    }

    const completionRate = total > 0
      ? Math.round((counts.COMPLETED / total) * 10000) / 100
      : 0;

    return {
      total,
      open: counts.OPEN,
      inProgress: counts.IN_PROGRESS,
      onHold: counts.ON_HOLD,
      completed: counts.COMPLETED,
      cancelled: counts.CANCELLED,
      completionRate,
    };
  }

  async getOrderTasks(orderId, queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...rest } = queryParams;
    return taskRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters: { orderId, ...rest },
    });
  }

  async getCrossProjectReport(queryParams) {
    const limit = queryParams.limit || 50;

    const Project = (await import('../pm/project.model.js')).default;
    const projects = await Project.find({ isDeleted: false })
      .select('_id name')
      .limit(limit)
      .lean();

    const projectIds = projects.map((p) => p._id);
    if (projectIds.length === 0) return [];

    const aggregated = await taskRepository.getCrossProjectReport(projectIds);

    const projectMap = new Map();
    for (const p of projects) {
      projectMap.set(p._id.toString(), p.name);
    }

    return aggregated.map((item) => {
      const completedEntry = item.statuses?.find((s) => s.status === 'COMPLETED');
      const completed = completedEntry ? completedEntry.count : 0;

      return {
        projectId: item.projectId,
        projectName: projectMap.get(item.projectId.toString()) || null,
        total: item.total,
        open: countStatus(item.statuses, 'OPEN'),
        inProgress: countStatus(item.statuses, 'IN_PROGRESS'),
        onHold: countStatus(item.statuses, 'ON_HOLD'),
        completed,
        cancelled: countStatus(item.statuses, 'CANCELLED'),
        completionRate: item.completionRate,
      };
    });
  }

  async getSyncChanges(userId, since) {
    const accessibleListIds = await taskAccessService.getAccessibleListIds(userId, { includeArchived: true });
    const tasks = await taskRepository.findChangedSince(userId, since, { accessibleListIds });

    const TaskList = (await import('./taskList.model.js')).default;
    const TaskListMember = (await import('./taskListMember.model.js')).default;

    const ownedLists = await TaskList.find({
      ownerId: userId,
      updatedAt: { $gt: new Date(since) },
    }).lean();

    const memberships = await TaskListMember.find({ userId }).select('listId').lean();
    const memberListIds = memberships.map((m) => m.listId);

    const memberLists = memberListIds.length > 0
      ? await TaskList.find({
        _id: { $in: memberListIds },
        updatedAt: { $gt: new Date(since) },
      }).lean()
      : [];

    const taskLists = [...ownedLists, ...memberLists];

    // Deduplicate task lists by _id
    const seenListIds = new Set();
    const uniqueTaskLists = taskLists.filter((list) => {
      const id = list._id.toString();
      if (seenListIds.has(id)) return false;
      seenListIds.add(id);
      return true;
    });

    // Determine latest change timestamp as the new sync cursor
    let latestTimestamp = new Date(since);
    for (const task of tasks) {
      if (task.updatedAt > latestTimestamp) latestTimestamp = task.updatedAt;
    }
    for (const list of uniqueTaskLists) {
      if (list.updatedAt > latestTimestamp) latestTimestamp = list.updatedAt;
    }

    return {
      tasks,
      taskLists: uniqueTaskLists,
      timestamp: latestTimestamp.toISOString(),
    };
  }

  async pushSyncChanges(userId, changes, meta = {}) {
    const applied = [];
    const conflicts = [];

    const taskService = (await import('./task.service.js')).default;
    const taskNoteService = (await import('./taskNote.service.js')).default;

    for (const change of changes) {
      try {
        const { type, entity, data, clientTimestamp } = change;

        if (entity === 'task') {
          await this._applySyncTaskChange(type, data, clientTimestamp, userId, meta, taskService);
          applied.push(change);
        } else if (entity === 'taskNote') {
          await this._applySyncNoteChange(type, data, clientTimestamp, userId, meta, taskNoteService);
          applied.push(change);
        } else {
          logger.warn('Unknown sync entity', { module: 'tasks', entity });
          conflicts.push({ change, reason: `Unknown entity: ${entity}` });
        }
      } catch (err) {
        logger.warn('Sync change failed', { module: 'tasks', change, error: err.message });
        conflicts.push({ change, reason: err.message });
      }
    }

    return { applied: applied.length, conflicts };
  }

  async _applySyncTaskChange(type, data, clientTimestamp, userId, meta, taskService) {
    if (type === 'create') {
      await taskService.create(data, userId, meta);
    } else if (type === 'update') {
      // Last-write-wins: check server updatedAt vs clientTimestamp
      const existing = await taskRepository.findById(data._id || data.id);
      if (existing && clientTimestamp) {
        const serverTime = new Date(existing.updatedAt).getTime();
        const clientTime = new Date(clientTimestamp).getTime();
        if (clientTime < serverTime) {
          throw new Error('Conflict: server version is newer');
        }
      }
      const { _id, id, ...updateData } = data;
      await taskService.update(_id || id, updateData, userId, meta);
    } else if (type === 'delete') {
      await taskService.remove(data._id || data.id, userId, meta);
    } else {
      throw new Error(`Unknown change type: ${type}`);
    }
  }

  async _applySyncNoteChange(type, data, clientTimestamp, userId, meta, taskNoteService) {
    if (type === 'create') {
      await taskNoteService.create(data.taskId, data, userId, meta);
    } else if (type === 'update') {
      const taskNoteRepository = (await import('./taskNote.repository.js')).default;
      const existing = await taskNoteRepository.findById(data._id || data.id);
      if (existing && clientTimestamp) {
        const serverTime = new Date(existing.updatedAt).getTime();
        const clientTime = new Date(clientTimestamp).getTime();
        if (clientTime < serverTime) {
          throw new Error('Conflict: server version is newer');
        }
      }
      const { _id, id, taskId, ...updateData } = data;
      await taskNoteService.update(_id || id, updateData, userId, meta);
    } else if (type === 'delete') {
      await taskNoteService.remove(data._id || data.id, userId, meta);
    } else {
      throw new Error(`Unknown change type: ${type}`);
    }
  }
}

const taskDashboardService = new TaskDashboardService();
export default taskDashboardService;
