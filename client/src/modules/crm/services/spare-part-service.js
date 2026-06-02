import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const sparePartService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS, { params });
    return res;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PART_BY_ID(id));
    return res.data;
  },
  async create(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.SPARE_PARTS, data);
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.SPARE_PART_BY_ID(id), data);
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.SPARE_PART_BY_ID(id));
    return res.data;
  },
  async search(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS_SEARCH, { params });
    return res.data;
  },
  async listOrderRequests(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PART_ORDER_REQUESTS, { params });
    return res;
  },
  async exportCsv(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS_EXPORT, {
      params,
      responseType: 'blob',
    });
    return res;
  },
  // Installation spare parts
  async getByInstallation(installationId) {
    const res = await apiClient.get(ENDPOINTS.CRM.INSTALLATION_SPARE_PARTS(installationId));
    return res.data;
  },
  async linkToInstallation(installationId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.INSTALLATION_SPARE_PARTS(installationId), data);
    return res.data;
  },
  async flagForOrdering(installationId, sparePartId, data) {
    const res = await apiClient.post(
      ENDPOINTS.CRM.INSTALLATION_SPARE_PART_ORDER_FLAG(installationId, sparePartId),
      data,
    );
    return res.data;
  },
  async updateOrderStatus(installationId, sparePartId, data) {
    const res = await apiClient.patch(
      ENDPOINTS.CRM.INSTALLATION_SPARE_PART_ORDER_STATUS(installationId, sparePartId),
      data,
    );
    return res.data;
  },
  async unlinkFromInstallation(installationId, sparePartId) {
    const res = await apiClient.delete(ENDPOINTS.CRM.INSTALLATION_SPARE_PART_UNLINK(installationId, sparePartId));
    return res.data;
  },
};
