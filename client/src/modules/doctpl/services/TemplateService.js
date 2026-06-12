import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const templateService = {
  list:         (p = {}) => apiClient.get(E.TEMPLATES, { params: p }),
  getById:      (id)     => apiClient.get(E.TEMPLATE_BY_ID(id)),
  create:       (d)      => apiClient.post(E.TEMPLATES, d),
  update:       (id, d)  => apiClient.put(E.TEMPLATE_BY_ID(id), d),
  listVersions: (id, p)  => apiClient.get(E.TEMPLATE_VERSIONS(id), { params: p }),
  getVersion:   (id, v)  => apiClient.get(E.TEMPLATE_VERSION(id, v)),
  compareVersions: (id, p) => apiClient.get(E.TEMPLATE_COMPARE(id), { params: p }),
  revert:       (id, v)  => apiClient.post(E.TEMPLATE_REVERT(id, v)),
  preview:      (id, d)  => apiClient.post(E.TEMPLATE_PREVIEW(id), d),
};
