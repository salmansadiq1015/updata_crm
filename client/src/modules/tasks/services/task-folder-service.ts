import apiClient from '@/lib/api/client';

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

function normalizeFolder(raw: unknown): any {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid folder response');
  const r = raw as Record<string, unknown>;
  return {
    id: ((r.id ?? r._id) as string),
    name: r.name as string,
    color: (r.color ?? null) as string | null,
    icon: (r.icon ?? null) as string | null,
    sortOrder: (r.sortOrder ?? 0) as number,
    ownerId: (r.ownerId ?? null) as string | null,
    lists: Array.isArray(r.lists) ? r.lists : [],
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  };
}

export const taskFolderService = {
  async list(): Promise<{ folders: any[]; unfoldered: any[] }> {
    const response = toApiResponse<Record<string, unknown>>(
      await apiClient.get(FOLDER_ENDPOINTS.LIST),
    );
    const payload = response.data ?? {};
    const r = payload as Record<string, unknown>;
    return {
      folders: Array.isArray(r.folders)
        ? (r.folders as unknown[]).map(normalizeFolder)
        : [],
      unfoldered: Array.isArray(r.unfoldered) ? (r.unfoldered as unknown[]) : [],
    };
  },

  async getById(id: string): Promise<any> {
    const response = toApiResponse<unknown>(await apiClient.get(FOLDER_ENDPOINTS.BY_ID(id)));
    return normalizeFolder(response.data);
  },

  async create(data: { name: string; color?: string | null; icon?: string | null }): Promise<any> {
    const response = toApiResponse<unknown>(await apiClient.post(FOLDER_ENDPOINTS.LIST, data));
    return normalizeFolder(response.data);
  },

  async update(id: string, patch: Record<string, unknown>): Promise<any> {
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
