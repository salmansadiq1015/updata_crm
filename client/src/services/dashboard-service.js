import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const dashboardService = {
  async getStats() {
    try {
      const res = await apiClient.get(ENDPOINTS.DASHBOARD.STATS);
      return res.data;
    } catch {
      return null;
    }
  },
};
