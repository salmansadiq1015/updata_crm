import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const deployDashboardService = {
  async getSummary(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.DASHBOARD_SUMMARY, { params });
    return res.data;
  },

  async getUtilization(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.DASHBOARD_UTILIZATION, { params });
    return res;
  },

  async getAlerts() {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.DASHBOARD_ALERTS);
    return res;
  },
};
