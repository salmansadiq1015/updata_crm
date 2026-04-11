import taskRepository from './task.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

const DASHBOARD_TTL = { l1Ttl: 30, l2Ttl: 60 };

class TaskDashboardService {
  async getDashboard(userId) {
    const cacheKey = `tasks:dashboard:${userId}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);

        const Task = (await import('./task.model.js')).default;

        const [overdue, dueToday, upcoming, recentlyCompleted] = await Promise.all([
          Task.find({
            assigneeId: userId,
            dueDate: { $lt: now },
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            isDeleted: false,
          })
            .sort({ dueDate: 1 })
            .limit(20)
            .lean(),

          Task.find({
            assigneeId: userId,
            dueDate: { $gte: startOfDay, $lt: endOfDay },
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            isDeleted: false,
          })
            .sort({ dueDate: 1 })
            .lean(),

          Task.find({
            assigneeId: userId,
            dueDate: { $gte: endOfDay, $lte: in7Days },
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            isDeleted: false,
          })
            .sort({ dueDate: 1 })
            .limit(20)
            .lean(),

          Task.find({
            completedBy: userId,
            status: 'COMPLETED',
            completedAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            isDeleted: false,
          })
            .sort({ completedAt: -1 })
            .limit(10)
            .lean(),
        ]);

        return { overdue, dueToday, upcoming, recentlyCompleted };
      },
      DASHBOARD_TTL,
    );
  }

  async getStats(userId) {
    const cacheKey = `tasks:stats:${userId}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const Task = (await import('./task.model.js')).default;
        const now = new Date();

        // Calculate Monday of current week
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

        const [totalOpen, completedThisWeek, overdueCount, totalTasks] = await Promise.all([
          Task.countDocuments({
            assigneeId: userId,
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
            status: 'COMPLETED',
            completedAt: { $gte: monday },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
            dueDate: { $lt: now },
            status: { $in: ['OPEN', 'IN_PROGRESS'] },
            isDeleted: false,
          }),

          Task.countDocuments({
            assigneeId: userId,
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

    const counts = { OPEN: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
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
        completed,
        completionRate: item.completionRate,
      };
    });
  }

  async getSyncChanges(userId, since) {
    const tasks = await taskRepository.findChangedSince(userId, since);

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
