import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const conflictService = {
  async checkConflicts(data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.CONFLICTS_CHECK, data);
    return res.data;
  },

  async listConflicts(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.CONFLICTS, { params });
    return res;
  },

  async resolveConflict(id, data) {
    const res = await apiClient.patch(ENDPOINTS.DEPLOY.CONFLICT_RESOLVE(id), data);
    return res.data;
  },
};
