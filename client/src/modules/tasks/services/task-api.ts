import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { rawTaskListSchema, rawTaskSchema } from '../schemas/task-schemas';
import type { Task, TaskList, TaskListParams, TaskPage, TaskPatch } from '../types/task-types';

type ApiEnvelope<T> = {
  data?: T;
  pagination?: TaskPage['pagination'] | null;
};

export const normalizeTask = (value: unknown): Task => rawTaskSchema.parse(value);

const parseTaskArray = (value: unknown): Task[] => {
  const rawItems = Array.isArray(value) ? value : [];
  return rawItems.map(normalizeTask);
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

export const taskApi = {
  async list(params: TaskListParams): Promise<TaskPage> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.LIST, { params }));
    return {
      data: parseTaskArray(response.data),
      pagination: response.pagination ?? {
        hasNext: false,
        nextCursor: null,
        limit: params.limit ?? 50,
      },
    };
  },

  async lists(): Promise<TaskList[]> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASK_LISTS.LIST));
    const payload = response.data;
    const items = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object'
        ? [
            ...(('personal' in payload && Array.isArray(payload.personal)) ? payload.personal : []),
            ...(('group' in payload && Array.isArray(payload.group)) ? payload.group : []),
          ]
        : [];
    return items.map((item) => rawTaskListSchema.parse(item));
  },

  async detail(id: string): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.get(ENDPOINTS.TASKS.BY_ID(id)));
    return normalizeTask(response.data);
  },

  async create(data: Pick<Task, 'title'> & Partial<TaskPatch>): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.LIST, data));
    return normalizeTask(response.data);
  },

  async patch(id: string, patch: TaskPatch): Promise<Task> {
    const changedKeys = Object.keys(patch).filter((key) => key !== 'expectedVersion');
    if (changedKeys.length === 1 && changedKeys[0] === 'status' && patch.status) {
      return taskApi.changeStatus(id, patch.status, patch.expectedVersion);
    }
    const response = toApiResponse<unknown>(await apiClient.put(ENDPOINTS.TASKS.BY_ID(id), patch));
    return normalizeTask(response.data);
  },

  async changeStatus(id: string, status: Task['status'], expectedVersion?: number): Promise<Task> {
    const response = toApiResponse<unknown>(
      await apiClient.patch(ENDPOINTS.TASKS.STATUS(id), { status, expectedVersion }),
    );
    return normalizeTask(response.data);
  },

  async remove(id: string): Promise<{ deleted: boolean }> {
    const response = toApiResponse<{ deleted?: boolean }>(await apiClient.delete(ENDPOINTS.TASKS.BY_ID(id)));
    return { deleted: response.data?.deleted ?? true };
  },

  async batchPatch(updates: Array<{ id: string; patch: TaskPatch }>): Promise<Task[]> {
    const response = toApiResponse<unknown[]>(await apiClient.patch('/tasks/batch', { updates }));
    return parseTaskArray(response.data);
  },

  async duplicate(id: string): Promise<Task> {
    const source = await taskApi.detail(id);
    return taskApi.create({
      title: `Copy of ${source.title}`,
      ...(source.description ? { description: source.description } : {}),
      status: 'OPEN' as const,
      priority: source.priority,
      ...(source.listId ? { listId: source.listId } : {}),
      ...(source.dueDate ? { dueDate: source.dueDate } : {}),
      ...(source.assigneeId ? { assigneeId: source.assigneeId } : {}),
    });
  },
};
