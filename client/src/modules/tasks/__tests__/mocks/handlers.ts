import { http, HttpResponse } from 'msw';
import { makeTask, makeTaskPage } from './data';
import type { Task, TaskPriority, TaskStatus } from '../../types/task-types';

const BASE = 'http://localhost:9097/api/v1';
const TASK_STATUSES = new Set<TaskStatus>(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
const TASK_PRIORITIES = new Set<TaskPriority>(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const readTaskStatus = (value: unknown): TaskStatus | undefined =>
  typeof value === 'string' && TASK_STATUSES.has(value as TaskStatus) ? value as TaskStatus : undefined;

const readTaskPriority = (value: unknown): TaskPriority | undefined =>
  typeof value === 'string' && TASK_PRIORITIES.has(value as TaskPriority) ? value as TaskPriority : undefined;

export const handlers = [
  // Tasks
  http.get(`${BASE}/tasks`, () => {
    return HttpResponse.json(makeTaskPage([]));
  }),

  http.post(`${BASE}/tasks`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const status = readTaskStatus(body.status);
    const priority = readTaskPriority(body.priority);
    return HttpResponse.json({
      success: true,
      data: makeTask({
        title: (body.title as string) ?? 'New Task',
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(body.listId ? { listId: body.listId as string } : {}),
        ...(body.assigneeId ? { assigneeId: body.assigneeId as string } : {}),
        ...(body.description ? { description: body.description as string } : {}),
        ...(body.dueDate ? { dueDate: body.dueDate as string } : {}),
      }),
    });
  }),

  http.get(`${BASE}/tasks/:id`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: makeTask({ id: params.id as string }),
    });
  }),

  http.put(`${BASE}/tasks/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const taskPatch: Partial<Task> = {
      id: params.id as string,
      ...(typeof body.title === 'string' ? { title: body.title } : {}),
      ...(typeof body.description === 'string' || body.description === null ? { description: body.description } : {}),
      ...(readTaskStatus(body.status) ? { status: readTaskStatus(body.status) } : {}),
      ...(readTaskPriority(body.priority) ? { priority: readTaskPriority(body.priority) } : {}),
      ...(typeof body.listId === 'string' || body.listId === null ? { listId: body.listId } : {}),
      ...(typeof body.assigneeId === 'string' || body.assigneeId === null ? { assigneeId: body.assigneeId } : {}),
      ...(typeof body.startDate === 'string' || body.startDate === null ? { startDate: body.startDate } : {}),
      ...(typeof body.dueDate === 'string' || body.dueDate === null ? { dueDate: body.dueDate } : {}),
    };
    return HttpResponse.json({
      success: true,
      data: makeTask(taskPatch),
    });
  }),

  http.patch(`${BASE}/tasks/:id/status`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const status = readTaskStatus(body.status) ?? 'OPEN';
    return HttpResponse.json({
      success: true,
      data: makeTask({ id: params.id as string, status }),
    });
  }),

  http.delete(`${BASE}/tasks/:id`, () => {
    return HttpResponse.json({ success: true, data: null });
  }),

  http.patch(`${BASE}/tasks/bulk`, () => {
    return HttpResponse.json({ success: true, data: { updated: 0, deleted: 0 } });
  }),

  // Task Lists
  http.get(`${BASE}/task-lists`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),

  http.post(`${BASE}/task-lists`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      success: true,
      data: {
        id: 'list-1',
        name: (body.name as string) ?? 'New List',
        type: 'PERSONAL',
        ownerId: null,
        color: null,
        icon: null,
        sortOrder: 0,
        isDefault: false,
        isArchived: false,
        openTaskCount: 0,
      },
    });
  }),

  // Task Folders
  http.get(`${BASE}/task-folders`, () => {
    return HttpResponse.json({
      success: true,
      data: { folders: [], unfoldered: [] },
    });
  }),

  http.post(`${BASE}/task-folders`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    return HttpResponse.json({
      success: true,
      data: {
        id: 'folder-1',
        name: (body.name as string) ?? 'New Folder',
        color: null,
        icon: null,
        sortOrder: 0,
        ownerId: null,
        lists: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  }),

  http.put(`${BASE}/task-folders/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    return HttpResponse.json({
      success: true,
      data: {
        id: params.id as string,
        name: (body.name as string) ?? 'Folder',
        color: null,
        icon: null,
        sortOrder: 0,
        ownerId: null,
        lists: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  }),

  http.delete(`${BASE}/task-folders/:id`, () => {
    return HttpResponse.json({ success: true, data: { deleted: true } });
  }),

  // Auth / Users
  http.get(`${BASE}/users`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),

  http.get(`${BASE}/auth/users`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),
];
