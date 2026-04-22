import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const statusService = {
  async transitionStatus(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.PM.STATUS_TRANSITION(projectId), data);
    return res.data;
  },

  async getStatusHistory(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.STATUS_HISTORY(projectId));
    return res.data;
  },
};
