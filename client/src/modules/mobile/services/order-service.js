import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const orderService = {
  async getOrders(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDERS, { params });
    return res.data;
  },

  async getAllOrders(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDERS, { params: { ...params, all: true } });
    // cursor response: res.data = { data: [...], pagination: {...} }
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  },

  async getAllOrdersPage(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDERS, { params: { ...params, all: true } });
    const body = res.data || {};
    return {
      items: Array.isArray(body) ? body : (body.data ?? []),
      pagination: body.pagination ?? null,
      summary: body.summary ?? {},
      syncTimestamp: body.syncTimestamp ?? null,
    };
  },

  async exportOrders(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDERS_EXPORT, {
      params: filters,
      responseType: 'blob',
    });
    return res.data;
  },

  async importOrders({ file, dryRun = false } = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('dryRun', dryRun ? 'true' : 'false');
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDERS_IMPORT, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data ?? res.data;
  },

  async downloadImportTemplate() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDERS_IMPORT_TEMPLATE, {
      responseType: 'blob',
    });
    return res.data;
  },

  async getOrderById(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_BY_ID(id));
    return res.data;
  },

  async updateOrderStatus(id, status) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.ORDER_STATUS(id), { status });
    return res.data;
  },

  async getOrderHistory(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_HISTORY(id));
    return res.data;
  },

  async createOrder(data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDERS, data);
    return res.data;
  },

  async updateOrder(id, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.ORDER_BY_ID(id), data);
    return res.data;
  },

  async deleteOrder(id) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.ORDER_BY_ID(id));
    return res.data;
  },

  async bulkDeleteOrders(ids) {
    const res = await apiClient.post(`${ENDPOINTS.MOBILE.ORDERS}/bulk-delete`, { ids });
    return res.data;
  },

  async getQuotation(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_QUOTATION(orderId));
    return res.data;
  },
};
