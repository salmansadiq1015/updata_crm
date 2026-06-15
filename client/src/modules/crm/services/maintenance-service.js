import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { downloadBlob } from '@/lib/api/download';

export const maintenanceService = {
  async getDashboard() {
    const res = await apiClient.get(ENDPOINTS.CRM.MAINTENANCE_DASHBOARD);
    return res.data;
  },
  async getSettings() {
    const res = await apiClient.get(ENDPOINTS.CRM.MAINTENANCE_SETTINGS);
    return res.data;
  },
  async updateSettings(data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.MAINTENANCE_SETTINGS, data);
    return res.data;
  },
  async listDue(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.MAINTENANCE_DUE, { params });
    return res;
  },
  async listOverdue(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.MAINTENANCE_OVERDUE, { params });
    return res;
  },
  async listByInstallation(installationId) {
    const res = await apiClient.get(ENDPOINTS.CRM.INSTALLATION_MAINTENANCE(installationId));
    return res.data;
  },
  async createForInstallation(installationId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.INSTALLATION_MAINTENANCE(installationId), data);
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.MAINTENANCE_BY_ID(id), data);
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.MAINTENANCE_BY_ID(id));
    return res.data;
  },
  async exportCsv({ status = 'all', maintenanceType } = {}) {
    const params = { status, format: 'csv' };
    if (maintenanceType) params.maintenanceType = maintenanceType;
    const { data } = await apiClient.get(ENDPOINTS.CRM.MAINTENANCE_EXPORT, {
      params,
      responseType: 'blob',
      transformResponse: [(x) => x],
    });
    const filename = `maintenance-${status}-${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(data, filename, 'text/csv;charset=utf-8');
    return { filename };
  },
};
