import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { downloadBlob } from '@/lib/api/download';

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

  async createFromTemplate(data) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECT_FROM_TEMPLATE, data);
    return res.data;
  },

  async archiveProject(id) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECT_ARCHIVE(id));
    return res.data;
  },

  async restoreProject(id) {
    const res = await apiClient.post(ENDPOINTS.PM.PROJECT_RESTORE(id));
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

  async getActivity(id) {
    const res = await apiClient.get(ENDPOINTS.PM.PROJECT_ACTIVITY(id));
    return res.data;
  },

  async getDashboardSummary() {
    const res = await apiClient.get(ENDPOINTS.PM.DASHBOARD_SUMMARY);
    return res.data;
  },

  async exportCsv(filters = {}) {
    const { data } = await apiClient.get(ENDPOINTS.PM.PROJECTS_EXPORT, {
      params: { ...filters, format: 'csv' },
      responseType: 'blob',
      transformResponse: [(x) => x],
    });
    const filename = `projects-${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(data, filename, 'text/csv;charset=utf-8');
    return { filename };
  },

  async getDashboardMilestones(days = 14) {
    const res = await apiClient.get(ENDPOINTS.PM.DASHBOARD_MILESTONES, {
      params: { days },
    });
    return res.data;
  },
};
