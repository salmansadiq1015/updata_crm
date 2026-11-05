import mongoose from 'mongoose';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

const cacheManagerMock = {
  getOrSet: jest.fn(async (_key, producer) => producer()),
  del: jest.fn(),
  invalidatePattern: jest.fn(),
};

jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: cacheManagerMock,
}));

jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

let Task;
let TaskList;
let taskService;
let taskDashboardService;
let taskTimeService;
let TaskTimeSession;

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function createList(ownerId, overrides = {}) {
  return TaskList.create({
    name: 'Personal tasks',
    type: 'PERSONAL',
    ownerId,
    ...overrides,
  });
}

async function createTask(listId, userId, overrides = {}) {
  return Task.create({
    title: 'Task',
    listId,
    createdBy: userId,
    assigneeId: userId,
    ...overrides,
  });
}

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/qop/order.model.js');
  await import('../../src/modules/meetings/meeting.model.js');
  // A task points at an object since the trade work landed; populating it
  // needs the model registered, which the server does at boot and a test
  // has to do by hand.
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/crm/site.model.js');
  await import('../../src/modules/qop/department.model.js');
  ({ default: TaskList } = await import('../../src/modules/tasks/taskList.model.js'));
  await import('../../src/modules/tasks/taskListMember.model.js');
  ({ default: Task } = await import('../../src/modules/tasks/task.model.js'));
  ({ default: taskService } = await import('../../src/modules/tasks/task.service.js'));
  ({ default: taskDashboardService } = await import('../../src/modules/tasks/taskDashboard.service.js'));
  ({ default: taskTimeService } = await import('../../src/modules/tasks/taskTime.service.js'));
  ({ default: TaskTimeSession } = await import('../../src/modules/tasks/taskTimeSession.model.js'));
  await TaskTimeSession.init();
});

afterEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('Task service access and hierarchy guards', () => {
  test('subtasks are readable by any colleague, because tasks are central', async () => {
    // The office decided every task is visible to everyone: work that only
    // one person can see is work nobody can pick up. Reading is open; writing
    // still follows the list.
    const ownerId = objectId();
    const colleagueId = objectId();
    const list = await createList(ownerId);
    const parent = await createTask(list._id, ownerId, { title: 'Parent' });
    const child = await createTask(list._id, ownerId, {
      title: 'Child',
      parentTaskId: parent._id,
      depth: 1,
    });

    for (const userId of [ownerId, colleagueId]) {
      const subtasks = await taskService.getSubtasks(parent._id, userId);
      expect(subtasks.map((task) => String(task._id))).toEqual([String(child._id)]);
    }
  });

  test('a locked task stays shut to everyone but its owner', async () => {
    // The one exception to central visibility, and the reason the rule is
    // safe to have: a confidential task is reachable by its owner alone.
    const ownerId = objectId();
    const colleagueId = objectId();
    const list = await createList(ownerId);
    // Locking records who did it, and that is what reopens the task for them:
    // assigneeId and createdBy come back populated, so they are user documents
    // and not ids — lockedBy is the field that answers without a join.
    const parent = await createTask(list._id, ownerId, {
      title: 'Parent',
      locked: true,
      lockedBy: ownerId,
      lockedAt: new Date(),
    });
    await createTask(list._id, ownerId, { title: 'Child', parentTaskId: parent._id, depth: 1 });

    await expect(taskService.getSubtasks(parent._id, colleagueId)).rejects.toMatchObject({
      code: 'TASK_LOCKED',
    });
    await expect(taskService.getSubtasks(parent._id, ownerId)).resolves.toHaveLength(1);
  });

  test('rejects subtask reorder payloads containing non-child task ids', async () => {
    const ownerId = objectId();
    const list = await createList(ownerId);
    const parent = await createTask(list._id, ownerId, { title: 'Parent' });
    const siblingParent = await createTask(list._id, ownerId, { title: 'Other parent' });
    const child = await createTask(list._id, ownerId, {
      title: 'Child',
      parentTaskId: parent._id,
      depth: 1,
    });
    const unrelatedChild = await createTask(list._id, ownerId, {
      title: 'Unrelated child',
      parentTaskId: siblingParent._id,
      depth: 1,
    });

    await expect(
      taskService.reorderSubtasks(parent._id, [child._id, unrelatedChild._id], ownerId),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('persists exact child reorder payloads', async () => {
    const ownerId = objectId();
    const list = await createList(ownerId);
    const parent = await createTask(list._id, ownerId, { title: 'Parent' });
    const first = await createTask(list._id, ownerId, {
      title: 'First',
      parentTaskId: parent._id,
      depth: 1,
      sortOrder: 0,
    });
    const second = await createTask(list._id, ownerId, {
      title: 'Second',
      parentTaskId: parent._id,
      depth: 1,
      sortOrder: 1,
    });

    await expect(taskService.reorderSubtasks(parent._id, [second._id, first._id], ownerId))
      .resolves.toEqual({ reordered: true });

    const [updatedSecond, updatedFirst] = await Promise.all([
      Task.findById(second._id).lean(),
      Task.findById(first._id).lean(),
    ]);
    expect(updatedSecond.sortOrder).toBe(0);
    expect(updatedFirst.sortOrder).toBe(1);
  });
});

describe('Task dashboard active status coverage', () => {
  test('counts ON_HOLD tasks as active in dashboard sections and stats', async () => {
    const userId = objectId();
    const list = await createList(userId);
    const now = new Date();

    await createTask(list._id, userId, {
      title: 'Paused overdue',
      status: 'ON_HOLD',
      dueDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });
    await createTask(list._id, userId, {
      title: 'Paused upcoming',
      status: 'ON_HOLD',
      dueDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    await createTask(list._id, userId, {
      title: 'Completed old',
      status: 'COMPLETED',
      completedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      dueDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    const dashboard = await taskDashboardService.getDashboard(userId);
    const stats = await taskDashboardService.getStats(userId);

    expect(dashboard.overdue.map((task) => task.title)).toContain('Paused overdue');
    expect(dashboard.upcoming.map((task) => task.title)).toContain('Paused upcoming');
    expect(stats.totalOpen).toBe(2);
    expect(stats.overdueCount).toBe(1);
  });
});

describe('Task metric filter contracts', () => {
  test('active includes paused and in-progress work and excludes closed work', async () => {
    const userId = objectId();
    const list = await createList(userId);
    for (const status of ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']) {
      await createTask(list._id, userId, { title: status, status });
    }
    const page = await taskService.list({ active: true, assigneeId: String(userId), limit: 50 }, userId);
    expect(page.data.map((task) => task.status).sort()).toEqual(['IN_PROGRESS', 'ON_HOLD', 'OPEN']);
  });

  test('completed-this-week excludes historical completions and other assignees', async () => {
    const userId = objectId();
    const list = await createList(userId);
    await createTask(list._id, userId, { title: 'This week', status: 'COMPLETED', completedAt: new Date() });
    await createTask(list._id, userId, { title: 'Last month', status: 'COMPLETED', completedAt: new Date(Date.now() - 30 * 86400000) });
    await createTask(list._id, userId, { title: 'Colleague', assigneeId: objectId(), status: 'COMPLETED', completedAt: new Date() });
    const page = await taskService.list({ completedThisWeek: true, assigneeId: String(userId), limit: 50 }, userId);
    expect(page.data.map((task) => task.title)).toEqual(['This week']);
  });
});


describe('Persistent task timers', () => {
  async function fixture() {
    const userId = objectId();
    const list = await createList(userId);
    const task = await createTask(list._id, userId);
    return { userId, list, task };
  }

  test('tracks server time, excludes pauses, resumes and stops idempotently', async () => {
    const { userId, task } = await fixture();
    const first = await taskTimeService.start(task._id, { mode: 'FOCUS', targetMinutes: 25 }, userId);
    const sessionId = first.session.id;
    await TaskTimeSession.updateOne({ _id: sessionId }, { segmentStartedAt: new Date(Date.now() - 60000) });
    const paused = await taskTimeService.transition(sessionId, 'pause', {}, userId);
    expect(paused.session.status).toBe('PAUSED');
    expect(paused.session.elapsedMs).toBeGreaterThanOrEqual(60000);
    const saved = paused.session.elapsedMs;
    const stillPaused = await taskTimeService.transition(sessionId, 'pause', {}, userId);
    expect(stillPaused.session.elapsedMs).toBe(saved);
    expect(stillPaused.session.pauseCount).toBe(1);
    await taskTimeService.transition(sessionId, 'resume', {}, userId);
    await TaskTimeSession.updateOne({ _id: sessionId }, { segmentStartedAt: new Date(Date.now() - 30000) });
    expect((await taskTimeService.transition(sessionId, 'stop', { note: '$literal note' }, userId)).session).toBeNull();
    const stopped = await TaskTimeSession.findById(sessionId).lean();
    expect(stopped.elapsedMs).toBeGreaterThanOrEqual(saved + 30000);
    expect(stopped.note).toBe('$literal note');
    expect(stopped.stoppedAt).toBeInstanceOf(Date);
    await taskTimeService.transition(sessionId, 'stop', { note: 'Retry' }, userId);
    expect((await TaskTimeSession.findById(sessionId)).elapsedMs).toBe(stopped.elapsedMs);
    expect((await TaskTimeSession.findById(sessionId)).note).toBe('$literal note');
  });

  test('concurrent starts reserve one employee timer and repeated starts reuse it', async () => {
    const { userId, list, task } = await fixture();
    const other = await createTask(list._id, userId);
    const results = await Promise.allSettled([taskTimeService.start(task._id, {}, userId), taskTimeService.start(other._id, {}, userId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await TaskTimeSession.countDocuments({ userId, isActive: true })).toBe(1);
    const active = await taskTimeService.active(userId);
    const retry = await taskTimeService.start(active.session.taskId, {}, userId);
    expect(retry.session.id).toBe(active.session.id);
    await taskTimeService.transition(active.session.id, 'pause', {}, userId);
    await expect(taskTimeService.start(String(task._id) === active.session.taskId ? other._id : task._id, {}, userId)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('employees cannot alter another employee session or start a closed or locked task', async () => {
    const { userId, task } = await fixture();
    const { session } = await taskTimeService.start(task._id, {}, userId);
    await expect(taskTimeService.transition(session.id, 'stop', {}, objectId())).rejects.toMatchObject({ statusCode: 404 });
    await Task.updateOne({ _id: task._id }, { locked: true });
    await expect(taskTimeService.start(task._id, {}, objectId())).rejects.toMatchObject({ statusCode: 403 });
    await Task.updateOne({ _id: task._id }, { status: 'COMPLETED' });
    await expect(taskTimeService.start(task._id, {}, userId)).rejects.toMatchObject({ statusCode: 400 });
    expect((await taskTimeService.active(userId)).session).toBeNull();
  });

  test('completion and deletion stop active sessions without losing recorded time', async () => {
    const { userId, list, task } = await fixture();
    const { session } = await taskTimeService.start(task._id, {}, userId);
    await taskService.changeStatus(task._id, 'COMPLETED', userId);
    expect((await TaskTimeSession.findById(session.id)).stopReason).toBe('TASK_CLOSED');
    const other = await createTask(list._id, userId);
    const second = await taskTimeService.start(other._id, {}, userId);
    await taskService.remove(other._id, userId);
    expect((await TaskTimeSession.findById(second.session.id)).stopReason).toBe('TASK_DELETED');
  });

  test('task and employee summaries use stopped-session averages and preserve history', async () => {
    const { userId, task } = await fixture();
    const colleague = objectId();
    const base = { taskId: task._id, taskTitle: task.title, status: 'STOPPED', isActive: false, startedAt: new Date(), stoppedAt: new Date() };
    await TaskTimeSession.create([
      { ...base, userId, elapsedMs: 60000 }, { ...base, userId, elapsedMs: 180000 }, { ...base, userId: colleague, elapsedMs: 120000 },
      { ...base, userId, status: 'PAUSED', isActive: true, stoppedAt: null, elapsedMs: 30000 },
    ]);
    const summary = await taskTimeService.summary(userId, { taskId: task._id, days: 0 });
    expect(summary).toMatchObject({ totalMs: 390000, myTotalMs: 270000, averageSessionMs: 120000, averageTaskMs: 390000, sessionCount: 4, activeCount: 1 });
    expect(summary.employees).toHaveLength(2);
    expect(summary.sessions).toHaveLength(4);
    const ownReport = await taskTimeService.summary(userId, { scope: 'mine', days: 30 });
    expect(ownReport.totalMs).toBe(270000);
    expect(ownReport.employees).toHaveLength(1);
  });

  test('secondary assignees can track their own work on a shared task', async () => {
    const { task } = await fixture();
    const colleague = objectId();
    await Task.updateOne({ _id: task._id }, { assigneeIds: [colleague] });
    const result = await taskTimeService.start(task._id, {}, colleague);
    expect(result.session.userId).toBe(String(colleague));
  });

  test('session history is paginated and deleted-task time remains in employee reports', async () => {
    const { userId, task } = await fixture();
    await TaskTimeSession.insertMany(Array.from({ length: 21 }, () => ({ taskId: task._id, taskTitle: task.title, userId,
      status: 'STOPPED', isActive: false, elapsedMs: 1000, startedAt: new Date(), stoppedAt: new Date() })));
    const first = await taskTimeService.summary(userId, { taskId: task._id, days: 0, page: 1 });
    const last = await taskTimeService.summary(userId, { taskId: task._id, days: 0, page: 2 });
    expect(first.sessions).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(last.sessions).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    await taskService.remove(task._id, userId);
    expect((await taskTimeService.summary(userId, { scope: 'mine', days: 0 })).totalMs).toBe(21000);
  });

  test('reports exclude confidential tasks even in team scope', async () => {
    const { userId, task } = await fixture();
    await Task.updateOne({ _id: task._id }, { locked: true });
    await TaskTimeSession.create({ taskId: task._id, taskTitle: task.title, userId, status: 'STOPPED', isActive: false, startedAt: new Date(), elapsedMs: 1000 });
    const report = await taskTimeService.summary(objectId(), { scope: 'team', days: 0 });
    expect(report.totalMs).toBe(0);
    expect(report.employees).toEqual([]);
  });
});
