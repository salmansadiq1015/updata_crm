import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.QOP;

export const quotationService = {
  list: (params = {}) => apiClient.get(E.QUOTATIONS, { params }),
  getById: (id) => apiClient.get(E.QUOTATION_BY_ID(id)),
  create: (data) => apiClient.post(E.QUOTATIONS, data),
  update: (id, data) => apiClient.put(E.QUOTATION_BY_ID(id), data),
  remove: (id) => apiClient.delete(E.QUOTATION_BY_ID(id)),
  updateStatus: (id, status) => apiClient.patch(E.QUOTATION_STATUS(id), { status }),
  send: (id) => apiClient.post(E.QUOTATION_SEND(id)),
  convert: (id) => apiClient.post(E.QUOTATION_CONVERT(id)),
  duplicate: (id) => apiClient.post(E.QUOTATION_DUPLICATE(id)),
  getHistory: (id) => apiClient.get(E.QUOTATION_HISTORY(id)),
};
