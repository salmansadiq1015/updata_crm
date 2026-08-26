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
