import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const installationService = {
  async getInstallations(siteId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.SITE_INSTALLATIONS(siteId));
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  },

  async getInstallationById(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.INSTALLATION_BY_ID(id));
    return res.data;
  },

  async getInstallationHistory(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.INSTALLATION_HISTORY(id));
    return res.data;
  },
};
