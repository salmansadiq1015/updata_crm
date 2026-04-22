import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const installationService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.INSTALLATIONS, { params });
    return res;
  },
  async listBySite(siteId) {
    const res = await apiClient.get(ENDPOINTS.CRM.SITE_INSTALLATIONS(siteId));
    return res.data;
  },
  async createForSite(siteId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.SITE_INSTALLATIONS(siteId), data);
    return res.data;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.INSTALLATION_BY_ID(id));
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.INSTALLATION_BY_ID(id), data);
    return res.data;
  },
  async decommission(id, reason) {
    const res = await apiClient.post(ENDPOINTS.CRM.INSTALLATION_DECOMMISSION(id), { reason });
    return res.data;
  },
};
