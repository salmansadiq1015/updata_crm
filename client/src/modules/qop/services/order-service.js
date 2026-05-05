import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.QOP;

export const orderService = {
  list: (params = {}) => apiClient.get(E.ORDERS, { params }),
  getById: (id) => apiClient.get(E.ORDER_BY_ID(id)),
  create: (data) => apiClient.post(E.ORDERS, data),
  update: (id, data) => apiClient.put(E.ORDER_BY_ID(id), data),
  updateStatus: (id, status) => apiClient.patch(E.ORDER_STATUS(id), { status }),
  getInvoices: (id) => apiClient.get(E.ORDER_INVOICES(id)),
  getHistory: (id) => apiClient.get(E.ORDER_HISTORY(id)),
};
