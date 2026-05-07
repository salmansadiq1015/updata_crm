import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const searchService = {
  search:         (params = {}) => apiClient.get(E.QOP_SEARCH, { params }),
  customerDocs:   (customerId, params = {}) => apiClient.get(E.QOP_CUSTOMER_DOCS(customerId), { params }),
  projectDocs:    (projectId, params = {})  => apiClient.get(E.QOP_PROJECT_DOCS(projectId), { params }),
  invoiceAging:   (params = {}) => apiClient.get(E.QOP_INVOICE_AGING, { params }),
  pipeline:       (params = {}) => apiClient.get(E.QOP_PIPELINE, { params }),
  listPresets:    ()            => apiClient.get(E.QOP_SEARCH_PRESETS),
  savePreset:     (name, filters) => apiClient.post(E.QOP_SEARCH_PRESETS, { name, filters }),
  deletePreset:   (id)          => apiClient.delete(E.QOP_SEARCH_PRESET_BY_ID(id)),
  exportCsv:      (params = {}) => apiClient.get(E.QOP_SEARCH_EXPORT, { params, responseType: 'blob' }),
};
