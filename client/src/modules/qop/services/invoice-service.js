import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.QOP;

export const invoiceService = {
  list: (params = {}) => apiClient.get(E.INVOICES, { params }),
  getById: (id) => apiClient.get(E.INVOICE_BY_ID(id)),
  create: (data) => apiClient.post(E.INVOICES, data),
  update: (id, data) => apiClient.put(E.INVOICE_BY_ID(id), data),
  updateStatus: (id, status) => apiClient.patch(E.INVOICE_STATUS(id), { status }),
  finalize: (id) => apiClient.post(E.INVOICE_FINALIZE(id)),
  send: (id) => apiClient.post(E.INVOICE_SEND(id)),
  addPayment: (id, data) => apiClient.post(E.INVOICE_PAYMENTS(id), data),
  getPayments: (id) => apiClient.get(E.INVOICE_PAYMENTS(id)),
  getHistory: (id) => apiClient.get(E.INVOICE_HISTORY(id)),
};
