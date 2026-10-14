import type { Task, TaskList } from '../../types/task-types';

let taskIdCounter = 1;
let listIdCounter = 1;

export function makeTask(overrides: Partial<Task> = {}): Task {
  const id = String(taskIdCounter++);
  const now = new Date().toISOString();
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: 'OPEN',
    priority: 'NONE',
    listId: null,
    assigneeId: null,
    assigneeIds: [],
    createdBy: null,
    updatedBy: null,
    parentTaskId: null,
    projectId: null,
    orderId: null,
    startDate: null,
    dueDate: null,
    sortOrder: 0,
    depth: 0,
    subtaskCount: 0,
    noteCount: 0,
    attachmentCount: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completedBy: null,
    cancelledAt: null,
    locked: false,
    lockedBy: null,
    inPool: false,
    poolHelperId: null,
    projectName: null,
    orderName: null,
    ...overrides,
  };
}

export function makeTaskList(overrides: Partial<TaskList> = {}): TaskList {
  const id = String(listIdCounter++);
  return {
    id,
    name: `List ${id}`,
    type: 'PERSONAL',
    ownerId: null,
    color: null,
    icon: null,
    sortOrder: 0,
    isDefault: false,
    isArchived: false,
    openTaskCount: 0,
    ...overrides,
  };
}

export function makeTaskPage(tasks: Task[], total = tasks.length) {
  return {
    success: true,
    data: tasks,
    pagination: {
      hasNext: false,
      nextCursor: null,
      limit: 50,
      total,
      page: 1,
      pages: 1,
      hasPrev: false,
    },
  };
}
