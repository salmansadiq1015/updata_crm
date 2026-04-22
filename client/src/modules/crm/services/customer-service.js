import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { downloadBlob } from '@/lib/api/download';

/**
 * Customer API service — thin axios wrappers.
 * List endpoints return the full envelope (to preserve `.pagination`).
 * Detail / mutation endpoints return `res.data` directly.
 */
export const customerService = {
  async getCustomers(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMERS, { params });
    return res;
  },

  async getCustomerById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_BY_ID(id));
    return res.data;
  },

  async createCustomer(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMERS, data);
    return res.data;
  },

  async updateCustomer(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.CUSTOMER_BY_ID(id), data);
    return res.data;
  },

  async archiveCustomer(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMER_ARCHIVE(id));
    return res.data;
  },

  async searchCustomers(q, limit = 25) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMERS_SEARCH, {
      params: { q, limit },
    });
    return res.data;
  },

  async findDuplicates({ name, postalCode }) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMERS_DUPLICATES, {
      params: { name, ...(postalCode ? { postalCode } : {}) },
    });
    return res.data; // { duplicates, hasDuplicates }
  },

  async bulkUpdate(ids, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.CUSTOMERS_BULK_UPDATE, {
      ids,
      data,
    });
    return res.data;
  },

  async bulkArchive(ids) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMERS_BULK_DELETE, { ids });
    return res.data;
  },

  async mergeCustomers(sourceId, targetId) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMERS_MERGE, {
      sourceId,
      targetId,
    });
    return res.data;
  },

  async getActivity(id, params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_ACTIVITY(id), { params });
    return res;
  },

  /**
   * Download customers CSV. Triggers a browser file download.
   * Returns { filename } so the caller can surface a success toast.
   */
  async exportCsv(filters = {}) {
    const { data } = await apiClient.get(ENDPOINTS.CRM.CUSTOMERS_EXPORT, {
      params: { ...filters, format: 'csv' },
      responseType: 'blob',
      transformResponse: [(x) => x],
    });
    const filename = `customers-${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(data, filename, 'text/csv;charset=utf-8');
    return { filename };
  },
};
