import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

// The real CacheManager (L1 only — no Redis in tests) is used on purpose: these
// tests pin that cached task reads are invalidated by writes from any path.
jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({ default: { publish: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let Task;
let TaskList;
let TaskNote;
let taskService;
let taskDashboardService;
let cacheManager;

const objectId = () => new mongoose.Types.ObjectId();
const DAY = 86400000;

beforeAll(async () => {
  await connectTestDb();
  for (const model of ['auth/user', 'pm/project', 'qop/order', 'meetings/meeting', 'crm/customer', 'crm/site', 'qop/department']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  ({ default: TaskList } = await import('../../src/modules/tasks/taskList.model.js'));
  await import('../../src/modules/tasks/taskListMember.model.js');
  ({ default: Task } = await import('../../src/modules/tasks/task.model.js'));
  ({ default: TaskNote } = await import('../../src/modules/tasks/taskNote.model.js'));
  ({ default: taskService } = await import('../../src/modules/tasks/task.service.js'));
  ({ default: taskDashboardService } = await import('../../src/modules/tasks/taskDashboard.service.js'));
  ({ default: cacheManager } = await import('../../src/shared/cache/CacheManager.js'));
  await Task.init();
});

afterEach(async () => {
  await clearTestDb();
  cacheManager.l1.flush();
});

afterAll(async () => {
  await disconnectTestDb();
});

async function seedList(ownerId) {
  return TaskList.create({ name: 'Inbox', type: 'PERSONAL', ownerId });
}

async function pageThrough(params, userId, { isAdmin = false, limit = 3 } = {}) {
  const ids = [];
  let cursor = null;
  for (let guard = 0; guard < 50; guard += 1) {
    const page = await taskService.list({ ...params, cursor, limit }, userId, { isAdmin });
    ids.push(...page.data.map((task) => String(task._id)));
    if (!page.pagination.hasNext) return ids;
    cursor = page.pagination.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

describe('task list keyset pagination over a nullable sort field', () => {
  test('dueDate asc/desc pages return every task exactly once, nulls included', async () => {
    const userId = objectId();
    const list = await seedList(userId);
    const base = Date.UTC(2026, 10, 1);
    const docs = [];
    for (let i = 0; i < 11; i += 1) {
      docs.push({
        title: `T${i}`, listId: list._id, createdBy: userId, assigneeId: userId, assigneeIds: [userId],
        // 4 without due date, two pairs sharing a due date (ties broken by _id)
        dueDate: i < 4 ? null : new Date(base + Math.floor(i / 2) * DAY),
      });
    }
    await Task.insertMany(docs);
    const all = (await Task.find({}).lean()).map((t) => String(t._id)).sort();

    for (const sortOrder of ['asc', 'desc']) {
      cacheManager.l1.flush();
      const ids = await pageThrough({ assigneeId: String(userId), sortBy: 'dueDate', sortOrder }, userId);
      expect([...ids].sort()).toEqual(all);
      expect(new Set(ids).size).toBe(ids.length);
      // order: nulls first ascending, last descending
      const byId = new Map((await Task.find({}).lean()).map((t) => [String(t._id), t.dueDate]));
      const dueSeq = ids.map((id) => byId.get(id));
      if (sortOrder === 'asc') expect(dueSeq.slice(0, 4)).toEqual([null, null, null, null]);
      else expect(dueSeq.slice(-4)).toEqual([null, null, null, null]);
    }
  });
});

describe('task read cache follows writes from any path', () => {
  test('a cached list page is refreshed by a write that bypasses the task service', async () => {
    const userId = objectId();
    const list = await seedList(userId);
    const [task] = await Task.insertMany([{ title: 'Before', listId: list._id, createdBy: userId }]);

    const first = await taskService.list({ hasParent: false, sortBy: 'sortOrder', sortOrder: 'asc', limit: 50 }, userId);
    expect(first.data.map((t) => t.title)).toEqual(['Before']);

    // e.g. the overdue-pool job or a workflow action writing through the model
    await Task.updateOne({ _id: task._id }, { $set: { title: 'After' } });
    const second = await taskService.list({ hasParent: false, sortBy: 'sortOrder', sortOrder: 'asc', limit: 50 }, userId);
    expect(second.data.map((t) => t.title)).toEqual(['After']);
  });

  test('status tiles (stats) and the dashboard update right after a task is completed', async () => {
    const userId = objectId();
    const list = await seedList(userId);
    const overdue = await Task.create({
      title: 'Overdue', listId: list._id, createdBy: userId, assigneeId: userId, assigneeIds: [userId],
      dueDate: new Date(Date.now() - 2 * DAY),
    });

    const before = await taskDashboardService.getStats(userId, {});
    expect(before).toEqual({ totalOpen: 1, completedThisWeek: 0, overdueCount: 1, totalTasks: 1 });
    const dashBefore = await taskDashboardService.getDashboard(userId, { upcomingDays: 7 });
    expect(dashBefore.overdue).toHaveLength(1);

    await Task.updateOne(
      { _id: overdue._id },
      { $set: { status: 'COMPLETED', completedAt: new Date(), completedBy: userId } },
    );

    const after = await taskDashboardService.getStats(userId, {});
    expect(after).toEqual({ totalOpen: 0, completedThisWeek: 1, overdueCount: 0, totalTasks: 1 });
    const dashAfter = await taskDashboardService.getDashboard(userId, { upcomingDays: 7 });
    expect(dashAfter.overdue).toHaveLength(0);
    expect(dashAfter.recentlyCompleted.map((t) => String(t._id))).toEqual([String(overdue._id)]);
  });

  test('task detail counts subtasks and notes and refreshes when a note is added', async () => {
    const userId = objectId();
    const list = await seedList(userId);
    const parent = await Task.create({ title: 'Parent', listId: list._id, createdBy: userId, assigneeId: userId });
    await Task.create({ title: 'Child', listId: list._id, createdBy: userId, parentTaskId: parent._id, depth: 1 });

    const detail = await taskService.getById(parent._id, userId);
    expect(detail.subtaskCount).toBe(1);
    expect(detail.noteCount).toBe(0);

    await TaskNote.create({ taskId: parent._id, authorId: userId, bodyHtml: '<p>n</p>' });

    const refreshed = await taskService.getById(parent._id, userId);
    expect(refreshed.noteCount).toBe(1);
  });
});
