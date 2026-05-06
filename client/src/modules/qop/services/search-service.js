import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const searchService = {
  search:         (params = {}) => apiClient.get(E.QOP_SEARCH, { params }),
  customerDocs:   (customerId)  => apiClient.get(E.QOP_CUSTOMER_DOCS(customerId)),
  projectDocs:    (projectId)   => apiClient.get(E.QOP_PROJECT_DOCS(projectId)),
  invoiceAging:   (params = {}) => apiClient.get(E.QOP_INVOICE_AGING, { params }),
  pipeline:       (params = {}) => apiClient.get(E.QOP_PIPELINE, { params }),
};
