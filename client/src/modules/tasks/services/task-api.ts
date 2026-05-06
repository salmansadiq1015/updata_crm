import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { rawTaskListSchema, rawTaskSchema } from '../schemas/task-schemas';
import type { Task, TaskList, TaskListParams, TaskPage, TaskPatch } from '../types/task-types';
import type { TaskNote, TaskAttachment } from '../types/task-types';

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

  async uploadAttachment(taskId: string, file: File): Promise<{ id: string; filename: string; url: string }> {
    const form = new FormData();
    form.append('file', file);
    const response = toApiResponse<{ id: string; filename: string; url: string }>(
      await apiClient.post(ENDPOINTS.TASKS.ATTACHMENTS(taskId), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
    return response.data!;
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

  async listSubtasks(parentId: string): Promise<Task[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.SUBTASKS(parentId)));
    return parseTaskArray(response.data);
  },

  async createSubtask(parentId: string, data: { title: string; priority?: Task['priority']; status?: Task['status'] }): Promise<Task> {
    const response = toApiResponse<unknown>(await apiClient.post(ENDPOINTS.TASKS.SUBTASKS(parentId), data));
    return normalizeTask(response.data);
  },

  async listNotes(taskId: string): Promise<TaskNote[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.NOTES(taskId)));
    const items = Array.isArray(response.data) ? response.data : [];
    return items.map((n: any) => ({
      id: String(n._id ?? n.id ?? ''),
      taskId: String(n.taskId ?? taskId),
      authorId: String(n.authorId?._id ?? n.authorId ?? ''),
      bodyHtml: String(n.bodyHtml ?? ''),
      isEdited: Boolean(n.isEdited),
      mentions: Array.isArray(n.mentions) ? n.mentions.map(String) : [],
      createdAt: n.createdAt ? (n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt)) : new Date().toISOString(),
      updatedAt: n.updatedAt ? (n.updatedAt instanceof Date ? n.updatedAt.toISOString() : String(n.updatedAt)) : new Date().toISOString(),
    }));
  },

  async createNote(taskId: string, bodyHtml: string): Promise<TaskNote> {
    const response = toApiResponse<any>(await apiClient.post(ENDPOINTS.TASKS.NOTES(taskId), { bodyHtml }));
    const n = response.data as any;
    return {
      id: String(n._id ?? n.id ?? ''),
      taskId: String(n.taskId ?? taskId),
      authorId: String(n.authorId?._id ?? n.authorId ?? ''),
      bodyHtml: String(n.bodyHtml ?? bodyHtml),
      isEdited: Boolean(n.isEdited),
      mentions: Array.isArray(n.mentions) ? n.mentions.map(String) : [],
      createdAt: n.createdAt ? String(n.createdAt) : new Date().toISOString(),
      updatedAt: n.updatedAt ? String(n.updatedAt) : new Date().toISOString(),
    };
  },

  async deleteNote(taskId: string, noteId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.NOTE_BY_ID(taskId, noteId));
  },

  async listAttachments(taskId: string): Promise<TaskAttachment[]> {
    const response = toApiResponse<unknown[]>(await apiClient.get(ENDPOINTS.TASKS.ATTACHMENTS(taskId)));
    const items = Array.isArray(response.data) ? response.data : [];
    const base = (apiClient.defaults?.baseURL ?? '').replace(/\/$/, '');
    return items.map((a: any) => ({
      id: String(a._id ?? a.id ?? ''),
      taskId: String(a.taskId ?? taskId),
      fileName: String(a.fileName ?? a.filename ?? 'file'),
      fileSize: Number(a.fileSize ?? 0),
      mimeType: String(a.mimeType ?? 'application/octet-stream'),
      uploadedBy: String(a.uploadedBy?._id ?? a.uploadedBy ?? ''),
      createdAt: a.createdAt ? String(a.createdAt) : new Date().toISOString(),
      downloadUrl: `${base}/tasks/${taskId}/attachments/${String(a._id ?? a.id ?? '')}/download`,
    }));
  },

  async deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(ENDPOINTS.TASKS.ATTACHMENT_BY_ID(taskId, attachmentId));
  },
};
