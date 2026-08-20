import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const orderService = {
  list:             (params = {}) => apiClient.get(E.ORDERS, { params }),
  getById:          (id)          => apiClient.get(E.ORDER_BY_ID(id)),
  create:           (data)        => apiClient.post(E.ORDERS, data),
  update:           (id, data)    => apiClient.put(E.ORDER_BY_ID(id), data),
  remove:           (id)          => apiClient.delete(E.ORDER_BY_ID(id)),
  transitionStatus: (id, targetStatus, reason) =>
    apiClient.patch(E.ORDER_STATUS(id), { targetStatus, reason }),
  getInvoices:      (id)          => apiClient.get(E.ORDER_INVOICES(id)),
  getBillingPlan:   (id)          => apiClient.get(E.ORDER_BILLING_PLAN(id)),
  generateDocument: (id)          => apiClient.post(E.ORDER_GENERATE_DOC(id)),
  createProject: (id, data = {}) => apiClient.post(E.ORDER_CREATE_PROJECT(id), data),
  getHistory:       (id)          => apiClient.get(E.ORDER_HISTORY(id)),
};
