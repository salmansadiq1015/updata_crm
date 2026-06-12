import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const invoiceService = {
  list:             (params = {}) => apiClient.get(E.INVOICES, { params }),
  getById:          (id)          => apiClient.get(E.INVOICE_BY_ID(id)),
  create:           (data)        => apiClient.post(E.INVOICES, data),
  createFromOrder:   (data)        => apiClient.post(E.INVOICE_FROM_ORDER, data),
  createFromQuotation: (data)      => apiClient.post(E.INVOICE_FROM_QUOTATION, data),
  createAdvance:    (data)        => apiClient.post(E.INVOICE_ADVANCE, data),
  createFinal:      (data)        => apiClient.post(E.INVOICE_FINAL, data),
  update:           (id, data)    => apiClient.put(E.INVOICE_BY_ID(id), data),
  finalize:         (id)          => apiClient.post(E.INVOICE_FINALIZE(id)),
  send:             (id)          => apiClient.post(E.INVOICE_SEND(id)),
  transitionStatus: (id, targetStatus, reason) =>
    apiClient.patch(E.INVOICE_STATUS(id), { targetStatus, reason }),
  recordPayment:    (id, data)    => apiClient.post(E.INVOICE_RECORD_PAYMENT(id), data),
  getPayments:      (id)          => apiClient.get(E.INVOICE_PAYMENTS(id)),
  generateDocument: (id)          => apiClient.post(E.INVOICE_GENERATE_DOC(id)),
  getHistory:       (id)          => apiClient.get(E.INVOICE_HISTORY(id)),
};
