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
  test('requires task read access before returning subtasks', async () => {
    const ownerId = objectId();
    const outsiderId = objectId();
    const list = await createList(ownerId);
    const parent = await createTask(list._id, ownerId, { title: 'Parent' });
    const child = await createTask(list._id, ownerId, {
      title: 'Child',
      parentTaskId: parent._id,
      depth: 1,
    });

    await expect(taskService.getSubtasks(parent._id, outsiderId)).rejects.toMatchObject({
      code: 'TASK_ACCESS_DENIED',
    });

    const subtasks = await taskService.getSubtasks(parent._id, ownerId);
    expect(subtasks.map((task) => String(task._id))).toEqual([String(child._id)]);
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
