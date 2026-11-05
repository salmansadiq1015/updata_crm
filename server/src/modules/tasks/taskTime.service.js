import mongoose from 'mongoose';
import TaskTimeSession from './taskTimeSession.model.js';
import Task from './task.model.js';
import taskAccessService from './taskAccess.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

const id = (value) => new mongoose.Types.ObjectId(String(value));
const closed = (task) => !task || task.isDeleted || ['COMPLETED', 'CANCELLED'].includes(task.status);

export function sessionElapsedMs(session, now = new Date()) {
  return Math.max(0, session.elapsedMs || 0) + (session.status === 'RUNNING' && session.segmentStartedAt
    ? Math.max(0, now.getTime() - new Date(session.segmentStartedAt).getTime()) : 0);
}

function serialize(session, now) {
  if (!session) return null;
  return { ...session, id: String(session._id), taskId: String(session.taskId), userId: String(session.userId), elapsedMs: sessionElapsedMs(session, now) };
}

// Updates derive duration from the stored segment inside the same atomic write.
// Concurrent stop/pause requests cannot count the same segment twice.
function finishPipeline(status, { note, stopReason = 'USER' } = {}) {
  return [{ $set: {
    elapsedMs: { $add: ['$elapsedMs', { $cond: [
      { $eq: ['$status', 'RUNNING'] }, { $max: [0, { $subtract: ['$$NOW', '$segmentStartedAt'] }] }, 0,
    ] }] },
    status,
    isActive: status !== 'STOPPED',
    segmentStartedAt: null,
    updatedAt: '$$NOW',
    ...(status === 'STOPPED' ? { stoppedAt: '$$NOW', stopReason } : { pauseCount: { $add: ['$pauseCount', 1] } }),
    ...(note !== undefined ? { note: { $literal: note } } : {}),
  } }];
}

async function assertCanTrack(task, userId, options = {}) {
  await taskAccessService.assertTaskAccess(task, userId, 'VIEWER', options);
  const assigned = String(task.assigneeId) === String(userId)
    || (task.assigneeIds ?? []).some(value => String(value) === String(userId));
  if (!assigned) await taskAccessService.assertTaskAccess(task, userId, 'EDITOR', options);
}

class TaskTimeService {
  async active(userId) {
    let session = await TaskTimeSession.findOne({ userId, isActive: true }).lean();
    // Also reconcile external task updates (imports, jobs) which bypass task.service.
    if (session) {
      const task = await Task.findById(session.taskId).select('status isDeleted').lean();
      if (closed(task)) {
        await this.stopForTasks([session.taskId], task?.isDeleted || !task ? 'TASK_DELETED' : 'TASK_CLOSED');
        session = null;
      }
    }
    const asOf = new Date();
    return { session: serialize(session, asOf), asOf };
  }

  async start(taskId, data, userId, { isAdmin = false } = {}) {
    const task = await Task.findById(taskId).lean();
    if (!task) throw new NotFoundError('Task', taskId);
    await assertCanTrack(task, userId, { isAdmin });
    if (closed(task)) throw new ValidationError('Reopen the task before starting a timer.');
    // Clear a timer whose task was closed by another workflow before checking the slot.
    const { session: existing } = await this.active(userId);
    if (existing) {
      if (existing.taskId === String(taskId)) return this.active(userId);
      throw new ConflictError('Stop your current task timer before starting another task.');
    }
    const now = new Date();
    try {
      await TaskTimeSession.create({ taskId, taskTitle: task.title, userId, startedAt: now, segmentStartedAt: now,
        mode: data.mode ?? 'TIMER', targetMinutes: data.targetMinutes ?? 25 });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const current = await this.active(userId);
      if (current.session?.taskId === String(taskId)) return current;
      throw new ConflictError('A task timer is already active. Refresh to continue.');
    }
    // Close the race where the task finished while the session was being created.
    return this.active(userId);
  }

  async transition(sessionId, action, data, userId) {
    const session = await TaskTimeSession.findOne({ _id: sessionId, userId }).lean();
    if (!session) throw new NotFoundError('Time session', sessionId);
    // Stop is intentionally available to its owner even after task access is revoked.
    if (action === 'stop') {
      await TaskTimeSession.updateOne({ _id: sessionId, userId, isActive: true }, finishPipeline('STOPPED', data), { updatePipeline: true });
    } else if (action === 'pause') {
      await TaskTimeSession.updateOne({ _id: sessionId, userId, status: 'RUNNING', isActive: true }, finishPipeline('PAUSED'), { updatePipeline: true });
    } else {
      const task = await Task.findById(session.taskId).lean();
      if (!task || closed(task)) throw new ValidationError('This task is closed. Stop the timer to finish the session.');
      await assertCanTrack(task, userId);
      await TaskTimeSession.updateOne({ _id: sessionId, userId, status: 'PAUSED', isActive: true }, [{ $set: {
        status: 'RUNNING', segmentStartedAt: '$$NOW', updatedAt: '$$NOW',
      } }], { updatePipeline: true });
    }
    return this.active(userId);
  }

  async stopForTasks(taskIds, stopReason = 'TASK_CLOSED') {
    await TaskTimeSession.updateMany({ taskId: { $in: taskIds }, isActive: true }, finishPipeline('STOPPED', { stopReason }), { updatePipeline: true });
  }

  async summary(userId, { taskId, days = 30, page = 1, scope = 'mine' } = {}, { isAdmin = false } = {}) {
    if (taskId) await taskAccessService.assertTaskAccess(String(taskId), userId, 'VIEWER', { isAdmin });
    const now = new Date();
    const match = {
      ...(taskId ? { taskId: id(taskId) } : {}),
      ...(!taskId && scope === 'mine' ? { userId: id(userId) } : {}),
      ...(days > 0 ? { startedAt: { $gte: new Date(now.getTime() - days * 86400000) } } : {}),
    };
    const visibility = taskId ? [] : [
      { $lookup: { from: Task.collection.name, localField: 'taskId', foreignField: '_id', as: 'task' } },
      { $unwind: '$task' },
      { $match: { ...(!isAdmin ? { $or: [
        { 'task.locked': { $ne: true } }, { 'task.createdBy': id(userId) }, { 'task.assigneeId': id(userId) }, { 'task.lockedBy': id(userId) },
      ] } : {}) } },
    ];
    const group = {
      totalMs: { $sum: '$durationMs' }, sessionCount: { $sum: 1 },
      stoppedCount: { $sum: { $cond: [{ $eq: ['$status', 'STOPPED'] }, 1, 0] } },
      stoppedMs: { $sum: { $cond: [{ $eq: ['$status', 'STOPPED'] }, '$durationMs', 0] } },
      activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
      focusCount: { $sum: { $cond: [{ $eq: ['$mode', 'FOCUS'] }, 1, 0] } },
      taskIds: { $addToSet: '$taskId' },
    };
    const [result] = await TaskTimeSession.aggregate([
      { $match: match }, ...visibility,
      { $set: { durationMs: { $add: ['$elapsedMs', { $cond: [
        { $eq: ['$status', 'RUNNING'] }, { $max: [0, { $subtract: [now, '$segmentStartedAt'] }] }, 0,
      ] }] } } },
      { $facet: {
        totals: [{ $group: { _id: null, ...group, myTotalMs: { $sum: { $cond: [{ $eq: ['$userId', id(userId)] }, '$durationMs', 0] } } } }],
        employees: [
          { $group: { _id: '$userId', ...group, lastStartedAt: { $max: '$startedAt' } } },
          { $sort: { totalMs: -1, _id: 1 } }, { $limit: 100 },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          { $project: { ...Object.fromEntries(Object.keys(group).map(key => [key, 1])), lastStartedAt: 1,
            firstName: { $arrayElemAt: ['$user.firstName', 0] }, lastName: { $arrayElemAt: ['$user.lastName', 0] } } },
        ],
        sessions: taskId ? [
          { $sort: { startedAt: -1, _id: -1 } }, { $skip: (page - 1) * 20 }, { $limit: 20 },
          { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
          { $set: { firstName: { $arrayElemAt: ['$user.firstName', 0] }, lastName: { $arrayElemAt: ['$user.lastName', 0] } } }, { $unset: 'user' },
        ] : [{ $limit: 1 }, { $match: { _id: null } }],
      } },
    ]);
    const metrics = (value = {}) => ({
      totalMs: value.totalMs ?? 0, sessionCount: value.sessionCount ?? 0, activeCount: value.activeCount ?? 0,
      focusCount: value.focusCount ?? 0, taskCount: value.taskIds?.length ?? 0,
      averageSessionMs: value.stoppedCount ? Math.round(value.stoppedMs / value.stoppedCount) : 0,
      averageTaskMs: value.taskIds?.length ? Math.round(value.totalMs / value.taskIds.length) : 0,
    });
    return {
      asOf: now, days, ...metrics(result.totals[0]), myTotalMs: result.totals[0]?.myTotalMs ?? 0,
      employees: result.employees.map(row => ({ userId: String(row._id), name: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(), lastStartedAt: row.lastStartedAt, ...metrics(row) })),
      sessions: result.sessions.map(row => ({ ...serialize(row, now), userName: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() })),
      page, hasMore: Boolean(taskId && page * 20 < (result.totals[0]?.sessionCount ?? 0)),
    };
  }
}

export default new TaskTimeService();
