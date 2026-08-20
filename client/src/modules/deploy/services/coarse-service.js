import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const coarseService = {
  async getMatrix(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.COARSE, { params });
    return res;
  },

  async createAllocation(data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.COARSE_ALLOCATIONS, data);
    return res.data;
  },

  async updateAllocation(id, data) {
    const res = await apiClient.patch(ENDPOINTS.DEPLOY.COARSE_ALLOCATION_BY_ID(id), data);
    return res.data;
  },

  async deleteAllocation(id) {
    const res = await apiClient.delete(ENDPOINTS.DEPLOY.COARSE_ALLOCATION_BY_ID(id));
    return res;
  },

  async moveAllocation(id, data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.COARSE_ALLOCATION_MOVE(id), data);
    return res.data;
  },

  async bulkUpsert(data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.COARSE_ALLOCATIONS_BULK, data);
    return res;
  },
};
