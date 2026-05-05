import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const taskListService = {
  async list() {
    const res = await apiClient.get(ENDPOINTS.TASK_LISTS.LIST);
    return res.data;
  },

  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.TASK_LISTS.BY_ID(id));
    return res.data;
  },

  async create(data) {
    const res = await apiClient.post(ENDPOINTS.TASK_LISTS.LIST, data);
    return res.data;
  },

  async update(id, data) {
    const res = await apiClient.put(ENDPOINTS.TASK_LISTS.BY_ID(id), data);
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.TASK_LISTS.BY_ID(id));
    return res.data;
  },

  async archive(id) {
    const res = await apiClient.patch(ENDPOINTS.TASK_LISTS.ARCHIVE(id), { archived: true });
    return res.data;
  },

  async unarchive(id) {
    const res = await apiClient.patch(ENDPOINTS.TASK_LISTS.UNARCHIVE(id), { archived: false });
    return res.data;
  },
};
