import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const documentService = {
  list:     (p = {}) => apiClient.get(E.DOCUMENTS, { params: p }),
  getById:  (id)     => apiClient.get(E.DOCUMENT_BY_ID(id)),
  generate: (d)      => apiClient.post(E.DOCUMENT_GENERATE, d),
  download: (id)     => apiClient.get(E.DOCUMENT_DOWNLOAD(id)),
  bySource: (mod, rid) => apiClient.get(E.DOCUMENT_BY_SOURCE(mod, rid)),
  delete:   (id)     => apiClient.delete(E.DOCUMENT_BY_ID(id)),
};
