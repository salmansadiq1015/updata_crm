import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const assignmentService = {
  async createAssignment(data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.ASSIGNMENTS, data);
    return res.data;
  },

  async getAssignment(id) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.ASSIGNMENT_BY_ID(id));
    return res.data;
  },

  async updateAssignment(id, data) {
    const res = await apiClient.patch(ENDPOINTS.DEPLOY.ASSIGNMENT_BY_ID(id), data);
    return res.data;
  },

  async deleteAssignment(id) {
    const res = await apiClient.delete(ENDPOINTS.DEPLOY.ASSIGNMENT_BY_ID(id));
    return res;
  },

  async moveAssignment(id, data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.ASSIGNMENT_MOVE(id), data);
    return res.data;
  },

  async resizeAssignment(id, data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.ASSIGNMENT_RESIZE(id), data);
    return res.data;
  },
};
