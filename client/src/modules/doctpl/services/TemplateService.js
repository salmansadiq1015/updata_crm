import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const templateService = {
  list:         (p = {}) => apiClient.get(E.TEMPLATES, { params: p }),
  getById:      (id)     => apiClient.get(E.TEMPLATE_BY_ID(id)),
  create:       (d)      => apiClient.post(E.TEMPLATES, d),
  update:       (id, d)  => apiClient.put(E.TEMPLATE_BY_ID(id), d),
  duplicate:    (id)     => apiClient.post(E.TEMPLATE_DUPLICATE(id)),
  remove:       (id)     => apiClient.delete(E.TEMPLATE_BY_ID(id)),
  listVersions: (id, p)  => apiClient.get(E.TEMPLATE_VERSIONS(id), { params: p }),
  getVersion:   (id, v)  => apiClient.get(E.TEMPLATE_VERSION(id, v)),
  previewVersion: (id, v, d) => apiClient.post(E.TEMPLATE_VERSION_PREVIEW(id, v), d),
  compareVersions: (id, p) => apiClient.get(E.TEMPLATE_COMPARE(id), { params: p }),
  revert:       (id, v, d = {})  => apiClient.post(E.TEMPLATE_REVERT(id, v), d),
  preview:      (id, d)  => apiClient.post(E.TEMPLATE_PREVIEW(id), d),
  requestApproval: (id, d = {}) => apiClient.post(E.TEMPLATE_APPROVAL_REQUEST(id), d),
  approve:      (id, d = {}) => apiClient.post(E.TEMPLATE_APPROVAL_APPROVE(id), d),
  reject:       (id, d)  => apiClient.post(E.TEMPLATE_APPROVAL_REJECT(id), d),
};
