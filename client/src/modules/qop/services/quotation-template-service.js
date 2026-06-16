import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;

export const quotationTemplateService = {
  list:         (params = {}) => apiClient.get(E.QUOTATION_TEMPLATES, { params }),
  listCategories: () => apiClient.get(E.QUOTATION_TEMPLATE_CATEGORIES),
  getById:      (id) => apiClient.get(E.QUOTATION_TEMPLATE_BY_ID(id)),
  create:       (data) => apiClient.post(E.QUOTATION_TEMPLATES, data),
  update:       (id, data) => apiClient.put(E.QUOTATION_TEMPLATE_BY_ID(id), data),
  remove:       (id) => apiClient.delete(E.QUOTATION_TEMPLATE_BY_ID(id)),
  recordUsage:  (id) => apiClient.post(E.QUOTATION_TEMPLATE_USE(id)),
  recurringItems: (params = {}) => apiClient.get(E.QUOTATION_RECURRING_ITEMS, { params }),
};
