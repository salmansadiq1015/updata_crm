import apiClient from '@/lib/api/client';
import { rawTaskFolderSchema, rawTaskListSchema } from '../schemas/task-schemas';
import type { TaskFolderCreate, TaskFolderPatch, TaskFolderWithLists, TaskList } from '../types/task-types';

const FOLDER_ENDPOINTS = {
  LIST: '/task-folders',
  BY_ID: (id: string) => `/task-folders/${id}`,
  REORDER: '/task-folders/reorder',
};

type ApiEnvelope<T> = {
  data?: T;
  meta?: Record<string, unknown>;
  pagination?: unknown;
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;
const normalizeFolder = (raw: unknown): TaskFolderWithLists => rawTaskFolderSchema.parse(raw);
const normalizeList = (raw: unknown): TaskList => rawTaskListSchema.parse(raw);

export const taskFolderService = {
  async list(): Promise<{ folders: TaskFolderWithLists[]; unfoldered: TaskList[] }> {
    const response = toApiResponse<Record<string, unknown>>(
      await apiClient.get(FOLDER_ENDPOINTS.LIST),
    );
    const payload = response.data ?? {};
    const r = payload as Record<string, unknown>;
    return {
      folders: Array.isArray(r.folders)
        ? (r.folders as unknown[]).map(normalizeFolder)
        : [],
      unfoldered: Array.isArray(r.unfoldered) ? (r.unfoldered as unknown[]).map(normalizeList) : [],
    };
  },

  async getById(id: string): Promise<TaskFolderWithLists> {
    const response = toApiResponse<unknown>(await apiClient.get(FOLDER_ENDPOINTS.BY_ID(id)));
    return normalizeFolder(response.data);
  },

  async create(data: TaskFolderCreate): Promise<TaskFolderWithLists> {
    const response = toApiResponse<unknown>(await apiClient.post(FOLDER_ENDPOINTS.LIST, data));
    return normalizeFolder(response.data);
  },

  async update(id: string, patch: TaskFolderPatch): Promise<TaskFolderWithLists> {
    const response = toApiResponse<unknown>(
      await apiClient.put(FOLDER_ENDPOINTS.BY_ID(id), patch),
    );
    return normalizeFolder(response.data);
  },

  async remove(id: string): Promise<{ deleted: boolean }> {
    const response = toApiResponse<{ deleted?: boolean }>(
      await apiClient.delete(FOLDER_ENDPOINTS.BY_ID(id)),
    );
    return { deleted: response.data?.deleted ?? true };
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await apiClient.patch(FOLDER_ENDPOINTS.REORDER, { orderedIds });
  },
};
