import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const supplierService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SUPPLIERS, { params });
    return res;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.SUPPLIER_BY_ID(id));
    return res.data;
  },
  async create(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.SUPPLIERS, data);
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.SUPPLIER_BY_ID(id), data);
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.SUPPLIER_BY_ID(id));
    return res.data;
  },
  async search(q) {
    const res = await apiClient.get(ENDPOINTS.CRM.SUPPLIERS_SEARCH, { params: { q } });
    return res.data;
  },
};
