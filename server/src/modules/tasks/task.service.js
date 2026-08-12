import taskRepository from './task.repository.js';
import taskListRepository from './taskList.repository.js';
import taskAccessService from './taskAccess.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { TASK_STATUSES, MAX_SUBTASK_DEPTH } from './task.model.js';

// Statuses that count as "offen" for an object's task overview.
const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class TaskService {
  async create(data, userId, meta = {}) {
    let { listId } = data;

    // Default list if none provided
    if (!listId) {
      const taskListService = (await import('./taskList.service.js')).default;
      const defaultList = await taskListService.ensureDefaultList(userId);
      listId = defaultList._id;
    } else {
      // Validate list exists and user has access
      const list = await taskListRepository.findById(listId);
      if (!list) throw new NotFoundError('TaskList', listId);
      await taskAccessService.assertListAccess(list, userId, 'EDITOR');
    }

    // Default assignee to creator
    const assigneeId = data.assigneeId || userId;
    // Sync assigneeIds: if provided use it, otherwise derive from assigneeId
    const assigneeIds = data.assigneeIds?.length ? data.assigneeIds : [assigneeId];

    // Validate projectId and orderId are not both set
    if (data.projectId && data.orderId) {
      throw new AppError(
        'Task cannot be linked to both a project and an order',
        400,
        ERROR_CODES.TASK_PROJECT_ORDER_CONFLICT,
      );
    }

    // Default Herkunft (source) from the linked record when not explicitly set.
    let source = data.source && data.source.type ? data.source : null;
    if (!source) {
      if (data.projectId) source = { type: 'PROJECT', refId: data.projectId };
      else if (data.orderId) source = { type: 'ORDER', refId: data.orderId };
      else if (data.meetingId) source = { type: 'MEETING', refId: data.meetingId };
      else source = { type: 'MANUAL' };
    }
    // Default department from the assignee's department when not explicitly set.
    const departmentId = data.departmentId || await this._resolveDepartmentForUser(assigneeId);

    const task = await taskRepository.create({
      ...data,
      listId,
      assigneeId,
      assigneeIds,
      source,
      departmentId,
      createdBy: userId,
    });
    const createdTask = await taskRepository.findById(task._id);

    await this._invalidateListTasksCache(listId);
    await this._applyDefaultReminder(createdTask, userId, meta);

    eventBus.publish(EVENT_TYPES.TASK_CREATED, {
      taskId: task._id,
      listId,
      version: createdTask.version,
      updatedAt: createdTask.updatedAt,
      task: createdTask,
      createdBy: userId,
      assigneeId,
      title: task.title,
    });

    if (String(assigneeId) !== String(userId)) {
      eventBus.publish(EVENT_TYPES.TASK_ASSIGNED, {
        taskId: task._id,
        assigneeId,
        assignedBy: userId,
        taskTitle: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
      });
    }

    auditService.logEvent({
      eventType: 'task.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: task._id, title: task.title, listId, assigneeId },
      module: 'tasks',
    });

    logger.info('Task created', { module: 'tasks', action: 'create', taskId: task._id, userId });

    return createdTask;
  }

  async getById(id, userId, { isAdmin = false } = {}) {
    const cacheKey = `tasks:task:${id}`;
    const task = await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const t = await taskRepository.findById(id);
        if (!t) return null;

        // Lazy aggregation for counts
        const [subtasks, notes, attachments] = await Promise.all([
          taskRepository.findByParentId(id),
          this._countNotes(id),
          this._countAttachments(id),
        ]);

        return {
          ...t,
          subtaskCount: subtasks.length,
          noteCount: notes,
          attachmentCount: attachments,
        };
      },
      ENTITY_TTL,
    );

    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'VIEWER', { isAdmin });

    return task;
  }

  /**
   * Every open task that concerns an object (Objekt), grouped by department —
   * the object's "Offene Aufgaben" overview. A task reaches the object either
   * directly (siteId) or through one of the object's projects. Locked tasks
   * stay invisible to everyone but their owner, as everywhere else.
   */
  async getSiteOverview(siteId, userId, { isAdmin = false, limit = 200 } = {}) {
    const Task = (await import('./task.model.js')).default;
    const Project = (await import('../pm/project.model.js')).default;

    const projects = await Project.find({ siteId, isDeleted: { $ne: true } }).select('_id').lean();
    const projectIds = projects.map((p) => p._id);

    const scope = { $or: [{ siteId }, ...(projectIds.length ? [{ projectId: { $in: projectIds } }] : [])] };
    const filter = {
      isDeleted: false,
      status: { $in: OPEN_TASK_STATUSES },
      ...scope,
    };
    if (!isAdmin) {
      filter.$and = [{
        $or: [
          { locked: { $ne: true } },
          { assigneeId: userId },
          { assigneeIds: userId },
          { createdBy: userId },
          { lockedBy: userId },
        ],
      }];
    }

    const tasks = await Task.find(filter)
      .select('title status priority dueDate departmentId assigneeId projectId siteId listId inPool')
      .populate({ path: 'departmentId', select: 'name code color icon sortOrder' })
      .populate({ path: 'assigneeId', select: 'firstName lastName email' })
      .populate({ path: 'projectId', select: 'name projectNumber' })
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    const buckets = new Map();
    for (const task of tasks) {
      const dep = task.departmentId;
      const key = dep?._id ? String(dep._id) : 'none';
      if (!buckets.has(key)) {
        buckets.set(key, {
          departmentId: dep?._id ? String(dep._id) : null,
          name: dep?.name || null,
          code: dep?.code || null,
          color: dep?.color || null,
          icon: dep?.icon || null,
          sortOrder: dep?.sortOrder ?? 999,
          count: 0,
        });
      }
      buckets.get(key).count += 1;
    }
    const byDepartment = [...buckets.values()].sort((a, b) => (
      a.departmentId === null ? 1 : b.departmentId === null ? -1 : a.sortOrder - b.sortOrder
    ));

    return { total: tasks.length, byDepartment, tasks };
  }

  async list(queryParams, userId, { isAdmin = false } = {}) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;

    // Admins see everything — no access filter applied
    if (isAdmin) {
      const filterKey = Object.entries(filters)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      const cacheKey = `tasks:tasks:list:admin:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;
      return cacheManager.getOrSet(
        cacheKey,
        () => taskRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
        LIST_TTL,
      );
    }

    // Non-admins get central visibility: all non-locked tasks, plus their own
    // locked ones (the repository access filter enforces this). Locked tasks of
    // other users are excluded, so no per-list access check is needed here.
    const scopedFilters = {
      ...filters,
      accessUserId: userId,
    };
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `tasks:tasks:list:${userId}:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => taskRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters: scopedFilters }),
      LIST_TTL,
    );
  }

  /** Resolve a default department for a task from the assignee's department string. */
  async _resolveDepartmentForUser(userId) {
    if (!userId) return null;
    try {
      const User = (await import('../auth/user.model.js')).default;
      const Department = (await import('../qop/department.model.js')).default;
      const user = await User.findById(userId).select('department').lean();
      if (!user?.department) return null;
      const dep = await Department.findOne({
        name: new RegExp(`^${String(user.department).trim()}$`, 'i'),
        isActive: true,
        scopeTasks: { $ne: false },
      }).select('_id').lean();
      return dep?._id || null;
    } catch {
      return null;
    }
  }

  async update(id, data, userId, meta = {}) {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(existing, userId, 'EDITOR');
    const { expectedVersion, ...patch } = data;

    // A locked task stays with its owner — reassignment is not allowed.
    if (existing.locked && patch.assigneeId && String(patch.assigneeId) !== String(existing.assigneeId)) {
      throw new AppError('Locked task cannot be reassigned', 403, ERROR_CODES.TASK_LOCKED);
    }

    // Keep assigneeId and assigneeIds in sync
    if (patch.assigneeIds) {
      patch.assigneeId = patch.assigneeIds[0] || null;
    } else if (patch.assigneeId !== undefined && !patch.assigneeIds) {
      // Single assignee changed — update the array too
      patch.assigneeIds = patch.assigneeId ? [patch.assigneeId] : [];
    }

    const updated = await taskRepository.updateById(id, { ...patch, updatedBy: userId }, { expectedVersion });
    if (!updated) {
      throw new AppError('Task was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(existing.listId);

    // Publish events for specific field changes
    if (patch.assigneeId && String(patch.assigneeId) !== String(existing.assigneeId)) {
      eventBus.publish(EVENT_TYPES.TASK_ASSIGNED, {
        taskId: id,
        assigneeId: patch.assigneeId,
        previousAssigneeId: existing.assigneeId,
        assignedBy: userId,
        taskTitle: existing.title,
        dueDate: patch.dueDate ?? existing.dueDate,
        priority: patch.priority ?? existing.priority,
      });
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'dueDate') && String(patch.dueDate) !== String(existing.dueDate)) {
      const taskReminderService = (await import('./taskReminder.service.js')).default;
      await taskReminderService.recalculateReminders(id, patch.dueDate);
      eventBus.publish(EVENT_TYPES.TASK_DUE_DATE_CHANGED, {
        taskId: id,
        previousDueDate: existing.dueDate,
        newDueDate: patch.dueDate,
        changedBy: userId,
      });
    }

    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: Object.keys(patch),
      task: updated,
      changedBy: userId,
    });

    auditService.logEvent({
      eventType: 'task.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, changedFields: Object.keys(patch) },
      module: 'tasks',
    });

    logger.info('Task updated', { module: 'tasks', action: 'update', taskId: id, userId });

    return updated;
  }

  async setLock(id, locked, userId, meta = {}) {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new NotFoundError('Task', id);

    // Only the task owner (assignee/creator/current locker) or an admin may
    // lock or unlock — a group editor must not hide a colleague's task.
    const isAdmin = meta.isAdmin === true;
    if (!isAdmin && !taskAccessService.isTaskOwner(existing, userId)) {
      throw new AppError('Only the task owner can lock or unlock this task', 403, ERROR_CODES.TASK_LOCKED);
    }

    const wantLocked = locked === true;
    const updated = await taskRepository.updateById(
      id,
      {
        locked: wantLocked,
        lockedBy: wantLocked ? userId : null,
        lockedAt: wantLocked ? new Date() : null,
        updatedBy: userId,
      },
      { expectedVersion: meta.expectedVersion },
    );
    if (!updated) {
      throw new AppError('Task was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(existing.listId);

    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['locked'],
      task: updated,
      changedBy: userId,
    });

    auditService.logEvent({
      eventType: wantLocked ? 'task.locked' : 'task.unlocked',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id },
      module: 'tasks',
    });

    logger.info(`Task ${wantLocked ? 'locked' : 'unlocked'}`, { module: 'tasks', action: 'setLock', taskId: id, userId });

    return updated;
  }

  // Take over a task: any user can claim a non-locked task to themselves
  // (central task management — helping out, absorbing workload). Locked tasks
  // stay with their owner and cannot be claimed.
  async claim(id, userId, meta = {}) {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new NotFoundError('Task', id);

    if (existing.locked) {
      throw new AppError('Locked task cannot be taken over', 403, ERROR_CODES.TASK_LOCKED);
    }
    // findById populates assigneeId, so unwrap the id before comparing.
    const currentAssigneeId = existing.assigneeId?._id ?? existing.assigneeId;
    if (String(currentAssigneeId) === String(userId)) {
      return existing; // already mine — no-op
    }

    const updated = await taskRepository.updateById(
      id,
      { assigneeId: userId, updatedBy: userId, inPool: false, poolHelperId: null },
      { expectedVersion: meta.expectedVersion },
    );
    if (!updated) {
      throw new AppError('Task was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(existing.listId);

    eventBus.publish(EVENT_TYPES.TASK_ASSIGNED, {
      taskId: id,
      assigneeId: userId,
      previousAssigneeId: currentAssigneeId,
      assignedBy: userId,
      taskTitle: existing.title,
      dueDate: existing.dueDate,
      priority: existing.priority,
    });
    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['assigneeId', 'inPool'],
      task: updated,
      changedBy: userId,
    });

    auditService.logEvent({
      eventType: 'task.claimed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, previousAssigneeId: existing.assigneeId },
      module: 'tasks',
    });

    logger.info('Task claimed', { module: 'tasks', action: 'claim', taskId: id, userId });

    return updated;
  }

  // Support a pooled task without taking ownership: the assignee stays, and the
  // helper is recorded (poolHelperId). Removes it from the pool so it is not
  // picked up twice. Locked tasks are never in the pool.
  async help(id, userId, meta = {}) {
    const existing = await taskRepository.findById(id);
    if (!existing) throw new NotFoundError('Task', id);

    if (existing.locked) {
      throw new AppError('Locked task cannot be taken over', 403, ERROR_CODES.TASK_LOCKED);
    }
    if (!existing.inPool) {
      throw new AppError('Task is not in the pool', 400, ERROR_CODES.TASK_NOT_IN_POOL);
    }
    // findById populates assigneeId, so unwrap the id before comparing.
    const currentAssigneeId = existing.assigneeId?._id ?? existing.assigneeId;
    if (String(currentAssigneeId) === String(userId)) {
      return existing; // it's already my task — nothing to support
    }

    const updated = await taskRepository.updateById(
      id,
      { poolHelperId: userId, inPool: false, updatedBy: userId },
      { expectedVersion: meta.expectedVersion },
    );
    if (!updated) {
      throw new AppError('Task was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(existing.listId);

    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['poolHelperId', 'inPool'],
      task: updated,
      changedBy: userId,
    });
    // Let the responsible person know a colleague stepped in to support.
    eventBus.publish(EVENT_TYPES.TASK_POOL_HELPED, {
      taskId: id,
      taskTitle: existing.title,
      assigneeId: currentAssigneeId,
      helperId: userId,
    });

    auditService.logEvent({
      eventType: 'task.pool_helped',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, assigneeId: existing.assigneeId },
      module: 'tasks',
    });

    logger.info('Task picked up from pool', { module: 'tasks', action: 'help', taskId: id, userId });

    return updated;
  }

  async remove(id, userId, meta = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    // Soft delete the task
    await taskRepository.softDelete(id);

    // Soft delete all subtasks
    const subtasks = await taskRepository.findByParentId(id);
    for (const subtask of subtasks) {
      await taskRepository.softDelete(subtask._id);
      await this._invalidateTaskCache(subtask._id);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(task.listId);

    eventBus.publish(EVENT_TYPES.TASK_DELETED, {
      taskId: id,
      listId: task.listId,
      deletedBy: userId,
      title: task.title,
    });

    auditService.logEvent({
      eventType: 'task.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, title: task.title, subtasksDeleted: subtasks.length },
      module: 'tasks',
    });

    logger.info('Task deleted', { module: 'tasks', action: 'remove', taskId: id, userId });

    return { deleted: true };
  }

  async changeStatus(id, status, userId, meta = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    const previousStatus = task.status;
    const updateData = { status, updatedBy: userId };
    if (Number.isInteger(meta.sortOrder)) {
      updateData.sortOrder = meta.sortOrder;
    }
    const changedFields = ['status', ...(Number.isInteger(meta.sortOrder) ? ['sortOrder'] : [])];

    // Handle completion
    if (status === 'COMPLETED') {
      await this._guardIncompleteSubtasks(id, {
        completeSubtasks: meta.completeSubtasks === true,
        completeParentOnly: meta.completeParentOnly === true,
      });
      updateData.completedAt = new Date();
      updateData.completedBy = userId;
    }

    // Handle cancellation
    if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date();
    }

    // Finishing a task removes it from the shared pool (single source of truth —
    // no duplicate or stale pool entry can linger).
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      updateData.inPool = false;
      updateData.poolHelperId = null;
    }

    // Handle reopening from completed
    if (previousStatus === 'COMPLETED' && status !== 'COMPLETED') {
      updateData.completedAt = null;
      updateData.completedBy = null;
    }

    const updated = await taskRepository.updateById(id, updateData, { expectedVersion: meta.expectedVersion });
    if (!updated) {
      throw new AppError('Task was modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    if (status === 'COMPLETED' && meta.completeSubtasks === true) {
      await this._completeSubtaskTree(id, userId, updateData.completedAt);
    }

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(task.listId);

    if (status === 'COMPLETED') {
      eventBus.publish(EVENT_TYPES.TASK_COMPLETED, {
        taskId: id,
        listId: updated.listId,
        version: updated.version,
        updatedAt: updated.updatedAt,
        task: updated,
        completedBy: userId,
        title: task.title,
      });
    } else if (previousStatus === 'COMPLETED') {
      eventBus.publish(EVENT_TYPES.TASK_REOPENED, {
        taskId: id,
        reopenedBy: userId,
        title: task.title,
      });
    } else {
      eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
        taskId: id,
        listId: updated.listId,
        version: updated.version,
        updatedAt: updated.updatedAt,
        previousStatus,
        newStatus: status,
        changedFields,
        task: updated,
        changedBy: userId,
      });
    }

    if (status === 'COMPLETED' || previousStatus === 'COMPLETED') {
      eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
        taskId: id,
        listId: updated.listId,
        version: updated.version,
        updatedAt: updated.updatedAt,
        previousStatus,
        newStatus: status,
        changedFields,
        task: updated,
        changedBy: userId,
      });
    }

    auditService.logEvent({
      eventType: 'task.status_changed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, previousStatus, newStatus: status },
      module: 'tasks',
    });

    logger.info('Task status changed', { module: 'tasks', action: 'changeStatus', taskId: id, previousStatus, newStatus: status, userId });

    return updated;
  }

  async complete(id, userId, meta = {}, { completeSubtasks = false, completeParentOnly = false } = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    if (task.status === 'COMPLETED') {
      throw new AppError('Task is already completed', 400, ERROR_CODES.TASK_ALREADY_COMPLETED);
    }

    await this._guardIncompleteSubtasks(id, { completeSubtasks, completeParentOnly });

    const now = new Date();
    const updated = await taskRepository.updateById(id, {
      status: 'COMPLETED',
      completedAt: now,
      completedBy: userId,
      updatedBy: userId,
      inPool: false,
      poolHelperId: null,
    });

    if (completeSubtasks) await this._completeSubtaskTree(id, userId, now);

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(task.listId);

    eventBus.publish(EVENT_TYPES.TASK_COMPLETED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['status', 'completedAt', 'completedBy'],
      task: updated,
      completedBy: userId,
      title: task.title,
      subtasksCompleted: completeSubtasks,
    });
    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['status', 'completedAt', 'completedBy'],
      task: updated,
    });

    auditService.logEvent({
      eventType: 'task.completed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, title: task.title, completeSubtasks },
      module: 'tasks',
    });

    logger.info('Task completed', { module: 'tasks', action: 'complete', taskId: id, userId, completeSubtasks });

    return updated;
  }

  async reopen(id, userId, meta = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    if (task.status !== 'COMPLETED') {
      throw new AppError('Only completed tasks can be reopened', 400, ERROR_CODES.TASK_NOT_COMPLETED);
    }

    const updated = await taskRepository.updateById(id, {
      status: 'OPEN',
      completedAt: null,
      completedBy: null,
      updatedBy: userId,
    });

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(task.listId);

    eventBus.publish(EVENT_TYPES.TASK_REOPENED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['status', 'completedAt', 'completedBy'],
      task: updated,
      reopenedBy: userId,
      title: task.title,
    });
    eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
      taskId: id,
      listId: updated.listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      changedFields: ['status', 'completedAt', 'completedBy'],
      task: updated,
    });

    auditService.logEvent({
      eventType: 'task.reopened',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, title: task.title },
      module: 'tasks',
    });

    logger.info('Task reopened', { module: 'tasks', action: 'reopen', taskId: id, userId });

    return updated;
  }

  async moveToList(id, listId, userId, meta = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    // Validate target list access
    const targetList = await taskListRepository.findById(listId);
    if (!targetList) throw new NotFoundError('TaskList', listId);
    await taskAccessService.assertListAccess(targetList, userId, 'EDITOR');

    const previousListId = task.listId;
    const updated = await taskRepository.updateById(id, { listId, updatedBy: userId });

    await this._invalidateTaskCache(id);
    await this._invalidateListTasksCache(previousListId);
    await this._invalidateListTasksCache(listId);

    eventBus.publish(EVENT_TYPES.TASK_MOVED, {
      taskId: id,
      previousListId,
      newListId: listId,
      listId,
      version: updated.version,
      updatedAt: updated.updatedAt,
      task: updated,
      movedBy: userId,
      title: task.title,
    });

    auditService.logEvent({
      eventType: 'task.moved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, previousListId, newListId: listId },
      module: 'tasks',
    });

    logger.info('Task moved to list', { module: 'tasks', action: 'moveToList', taskId: id, previousListId, newListId: listId, userId });

    return updated;
  }

  async bulkOperation(action, taskIds, data, userId, meta = {}) {
    if (taskIds.length > 100) {
      throw new AppError('Bulk operation limited to 100 tasks', 400, ERROR_CODES.TASK_BULK_LIMIT_EXCEEDED);
    }

    await this._assertBulkWriteAccess(taskIds, userId);

    let result;

    switch (action) {
      case 'updateStatus': {
        result = await taskRepository.bulkUpdate(taskIds, { status: data.status, updatedBy: userId });
        break;
      }
      case 'reassign': {
        const lockedIds = await taskRepository.findLockedIds(taskIds);
        if (lockedIds.length > 0) {
          throw new AppError('Locked tasks cannot be reassigned', 403, ERROR_CODES.TASK_LOCKED);
        }
        result = await taskRepository.bulkUpdate(taskIds, { assigneeId: data.assigneeId, updatedBy: userId });
        break;
      }
      case 'updatePriority': {
        result = await taskRepository.bulkUpdate(taskIds, { priority: data.priority, updatedBy: userId });
        break;
      }
      case 'moveToList': {
        const targetList = await taskListRepository.findById(data.listId);
        if (!targetList) throw new NotFoundError('TaskList', data.listId);
        await taskAccessService.assertListAccess(targetList, userId, 'EDITOR');
        result = await taskRepository.bulkUpdate(taskIds, { listId: data.listId, updatedBy: userId });
        break;
      }
      case 'delete': {
        result = await taskRepository.bulkUpdate(taskIds, { isDeleted: true, deletedAt: new Date() });
        break;
      }
      default: {
        throw new AppError(`Unknown bulk action: ${action}`, 400, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    // Invalidate caches for all affected tasks
    for (const taskId of taskIds) {
      await this._invalidateTaskCache(taskId);
    }

    auditService.logEvent({
      eventType: 'task.bulk_operation',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { action, taskCount: taskIds.length, data },
      module: 'tasks',
    });

    logger.info('Bulk task operation', { module: 'tasks', action: 'bulkOperation', bulkAction: action, taskCount: taskIds.length, userId });

    return { action, modifiedCount: result };
  }

  async batchPatch(updates, userId, meta = {}) {
    const normalizedUpdates = [];

    for (const update of updates) {
      const task = await taskRepository.findById(update.id);
      if (!task) throw new NotFoundError('Task', update.id);
      await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

      const { expectedVersion, ...data } = update.patch;
      if (task.locked && data.assigneeId && String(data.assigneeId) !== String(task.assigneeId)) {
        throw new AppError('Locked task cannot be reassigned', 403, ERROR_CODES.TASK_LOCKED);
      }
      if (expectedVersion !== undefined && task.version !== expectedVersion) {
        throw new AppError('One or more tasks were modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
      }
      normalizedUpdates.push({
        id: update.id,
        patch: {
          expectedVersion,
          data: { ...data, updatedBy: userId },
        },
      });
    }

    const result = await taskRepository.batchPatch(normalizedUpdates);
    if (result.modifiedCount !== normalizedUpdates.length) {
      throw new AppError('One or more tasks were modified by another user. Refresh and retry.', 409, ERROR_CODES.CONFLICT);
    }

    for (const task of result.tasks) {
      await this._invalidateTaskCache(task._id);
      await this._invalidateListTasksCache(task.listId);
      eventBus.publish(EVENT_TYPES.TASK_UPDATED, {
        taskId: task._id,
        listId: task.listId,
        version: task.version,
        updatedAt: task.updatedAt,
        changedFields: Object.keys(normalizedUpdates.find((item) => String(item.id) === String(task._id))?.patch.data || {}),
        task,
        changedBy: userId,
      });
    }

    auditService.logEvent({
      eventType: 'task.batch_patch',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskCount: updates.length },
      module: 'tasks',
    });

    return result.tasks;
  }

  async createSubtask(parentId, data, userId, meta = {}) {
    const parent = await taskRepository.findById(parentId);
    if (!parent) throw new NotFoundError('Task', parentId);

    await taskAccessService.assertTaskAccess(parent, userId, 'EDITOR');

    if (parent.depth >= MAX_SUBTASK_DEPTH) {
      throw new AppError(
        `Maximum subtask depth of ${MAX_SUBTASK_DEPTH} exceeded`,
        400,
        ERROR_CODES.TASK_DEPTH_EXCEEDED,
      );
    }

    const subtaskData = {
      ...data,
      parentTaskId: parentId,
      depth: parent.depth + 1,
      listId: parent.listId,
      projectId: parent.projectId,
      orderId: parent.orderId,
      assigneeId: data.assigneeId || userId,
      createdBy: userId,
    };

    const subtask = await taskRepository.create(subtaskData);

    await this._invalidateTaskCache(parentId);
    await this._invalidateListTasksCache(parent.listId);

    eventBus.publish(EVENT_TYPES.TASK_CREATED, {
      taskId: subtask._id,
      parentTaskId: parentId,
      listId: parent.listId,
      createdBy: userId,
      title: subtask.title,
    });

    auditService.logEvent({
      eventType: 'task.subtask_created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { subtaskId: subtask._id, parentTaskId: parentId, title: subtask.title },
      module: 'tasks',
    });

    logger.info('Subtask created', { module: 'tasks', action: 'createSubtask', subtaskId: subtask._id, parentTaskId: parentId, userId });

    return taskRepository.findById(subtask._id);
  }

  async getSubtasks(parentId, userId) {
    const parent = await taskRepository.findById(parentId);
    if (!parent) throw new NotFoundError('Task', parentId);

    await taskAccessService.assertTaskAccess(parent, userId, 'VIEWER');

    return taskRepository.findByParentId(parentId);
  }

  async promote(id, userId, meta = {}) {
    const task = await taskRepository.findById(id);
    if (!task) throw new NotFoundError('Task', id);

    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    const updated = await taskRepository.updateById(id, {
      parentTaskId: null,
      depth: 0,
      updatedBy: userId,
    });

    await this._invalidateTaskCache(id);
    if (task.parentTaskId) {
      await this._invalidateTaskCache(task.parentTaskId);
    }
    await this._invalidateListTasksCache(task.listId);

    auditService.logEvent({
      eventType: 'task.promoted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId: id, previousParentId: task.parentTaskId },
      module: 'tasks',
    });

    logger.info('Task promoted', { module: 'tasks', action: 'promote', taskId: id, userId });

    return updated;
  }

  async reorderSubtasks(parentId, orderedIds, userId) {
    const parent = await taskRepository.findById(parentId);
    if (!parent) throw new NotFoundError('Task', parentId);

    await taskAccessService.assertTaskAccess(parent, userId, 'EDITOR');

    const subtasks = await taskRepository.findByParentId(parentId);
    const childIds = new Set(subtasks.map((task) => String(task._id)));
    const invalidIds = orderedIds.filter((id) => !childIds.has(String(id)));
    if (invalidIds.length > 0 || orderedIds.length !== childIds.size) {
      throw new AppError(
        'Subtask reorder payload must contain exactly the parent task child IDs',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        { invalidIds },
      );
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await taskRepository.updateById(orderedIds[i], { sortOrder: i });
    }

    await this._invalidateTaskCache(parentId);
    await this._invalidateListTasksCache(parent.listId);

    logger.info('Subtasks reordered', { module: 'tasks', action: 'reorderSubtasks', parentId, userId, count: orderedIds.length });

    return { reordered: true };
  }

  async _assertBulkWriteAccess(taskIds, userId) {
    const tasks = await Promise.all(taskIds.map((taskId) => taskRepository.findById(taskId)));
    if (tasks.some((task) => !task)) {
      throw new AppError('One or more tasks were not found', 404, ERROR_CODES.TASK_NOT_FOUND);
    }

    for (const task of tasks) {
      await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');
    }
  }

  async _findIncompleteSubtasks(parentId) {
    const queue = await taskRepository.findByParentId(parentId);
    const incomplete = [];

    while (queue.length > 0) {
      const subtask = queue.shift();
      if (subtask.status !== 'COMPLETED') {
        incomplete.push({
          id: String(subtask._id),
          title: subtask.title,
          status: subtask.status,
          parentTaskId: subtask.parentTaskId ? String(subtask.parentTaskId) : null,
        });
      }
      const children = await taskRepository.findByParentId(subtask._id);
      queue.push(...children);
    }

    return incomplete;
  }

  async _guardIncompleteSubtasks(parentId, { completeSubtasks = false, completeParentOnly = false } = {}) {
    if (completeSubtasks || completeParentOnly) return;

    const incomplete = await this._findIncompleteSubtasks(parentId);
    if (incomplete.length === 0) return;

    throw new AppError(
      `Task has ${incomplete.length} incomplete subtask(s)`,
      409,
      ERROR_CODES.TASK_INCOMPLETE_SUBTASKS,
      incomplete,
    );
  }

  async _completeSubtaskTree(parentId, userId, completedAt) {
    const subtasks = await taskRepository.findByParentId(parentId);
    for (const subtask of subtasks) {
      if (subtask.status !== 'COMPLETED') {
        await taskRepository.updateById(subtask._id, {
          status: 'COMPLETED',
          completedAt,
          completedBy: userId,
          updatedBy: userId,
        });
        await this._invalidateTaskCache(subtask._id);
      }
      await this._completeSubtaskTree(subtask._id, userId, completedAt);
    }
  }

  async _applyDefaultReminder(task, userId, meta = {}) {
    if (!task?.dueDate) return;

    try {
      const taskReminderService = (await import('./taskReminder.service.js')).default;
      await taskReminderService.applyDefaultForTask(task, userId, meta);
    } catch (err) {
      logger.warn('Failed to apply default task reminder', {
        module: 'tasks',
        action: 'applyDefaultReminder',
        taskId: task._id,
        userId,
        error: err.message,
      });
    }
  }

  async _countNotes(taskId) {
    try {
      const TaskNote = (await import('./taskNote.model.js')).default;
      return TaskNote.countDocuments({ taskId, isDeleted: false });
    } catch {
      return 0;
    }
  }

  async _countAttachments(taskId) {
    try {
      const TaskAttachment = (await import('./taskAttachment.model.js')).default;
      return TaskAttachment.countDocuments({ taskId, isDeleted: false });
    } catch {
      return 0;
    }
  }

  async _invalidateTaskCache(id) {
    await cacheManager.del(`tasks:task:${id}`);
  }

  async _invalidateListTasksCache(listId) {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}tasks:tasks:list:*`);
  }
}

const taskService = new TaskService();
export default taskService;
