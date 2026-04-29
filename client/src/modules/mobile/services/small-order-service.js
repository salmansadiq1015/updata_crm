import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const smallOrderService = {
  async create(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.PROJECT_SMALL_ORDERS(projectId), data);
    return res.data;
  },

  async update(projectId, id, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.SMALL_ORDER_BY_ID(projectId, id), data);
    return res.data;
  },

  async cancel(projectId, id) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.SMALL_ORDER_BY_ID(projectId, id));
    return res.data;
  },
};
