import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const siteService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SITES, { params });
    return res;
  },
  async listByCustomer(customerId) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_SITES(customerId));
    return res.data;
  },
  async createForCustomer(customerId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMER_SITES(customerId), data);
    return res.data;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.SITE_BY_ID(id));
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.SITE_BY_ID(id), data);
    return res.data;
  },
  async deactivate(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.SITE_DEACTIVATE(id));
    return res.data;
  },
};
