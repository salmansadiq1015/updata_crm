import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const projectService = {
  async getProjects(params = {}) {
    const res = await apiClient.get(ENDPOINTS.PM.PROJECTS, { params });
    return res;
  },

  async getProjectById(id) {
    const res = await apiClient.get(ENDPOINTS.PM.PROJECT_BY_ID(id));
    return res.data;
  },

  async createProject(data) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECTS, data);
    return res.data;
  },

  async updateProject(id, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.PROJECT_BY_ID(id), data);
    return res.data;
  },

  async deleteProject(id) {
    const res = await apiClient.delete(ENDPOINTS.PM.PROJECT_BY_ID(id));
    return res.data;
  },

  async duplicateProject(id) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECT_DUPLICATE(id));
    return res.data;
  },

  async searchProjects(q, limit = 25) {
    const res = await apiClient.get(ENDPOINTS.PM.PROJECTS_SEARCH, {
      params: { q, limit },
    });
    return res.data;
  },

  async bulkUpdate(ids, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.PROJECTS_BULK_UPDATE, { ids, data });
    return res.data;
  },

  async bulkDelete(ids) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECTS_BULK_DELETE, { ids });
    return res.data;
  },

  async getDashboardSummary() {
    const res = await apiClient.get(ENDPOINTS.PM.DASHBOARD_SUMMARY);
    return res.data;
  },

  async getDashboardMilestones(days = 14) {
    const res = await apiClient.get(ENDPOINTS.PM.DASHBOARD_MILESTONES, {
      params: { days },
    });
    return res.data;
  },
};
