import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const assetMaintenanceService = {
  async listWorkItems(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.ASSET_MAINTENANCE_WORK_ITEMS, { params });
    return res;
  },

  async getContext(installationId) {
    const res = await apiClient.get(ENDPOINTS.CRM.ASSET_MAINTENANCE_CONTEXT(installationId));
    return res.data;
  },

  async bulkCreateMaintenance(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.ASSET_MAINTENANCE_BULK, data);
    return res.data;
  },

  async schedule(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.ASSET_MAINTENANCE_SCHEDULE, data);
    return res.data;
  },
};
