import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const prepActionService = {
  async getPrepActions(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTIONS(projectId));
    return res.data;
  },

  async getPrepActionById(projectId, actionId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId));
    return res.data;
  },

  async createPrepAction(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.PM.PREP_ACTIONS(projectId), data);
    return res.data;
  },

  async updatePrepAction(projectId, actionId, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId), data);
    return res.data;
  },

  async deletePrepAction(projectId, actionId) {
    const res = await apiClient.delete(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId));
    return res.data;
  },
};
