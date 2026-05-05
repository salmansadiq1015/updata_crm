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
