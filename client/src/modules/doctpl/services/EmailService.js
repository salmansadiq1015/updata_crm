import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const emailService = {
  compose: (d)    => apiClient.post(E.EMAIL_COMPOSE, d),
  send:    (d)    => apiClient.post(E.EMAIL_SEND, d),
  list:    (p={}) => apiClient.get(E.EMAILS, { params: p }),
  getById: (id)   => apiClient.get(E.EMAIL_BY_ID(id)),
  retry:   (id)   => apiClient.post(E.EMAIL_RETRY(id)),
  listTemplates: ()        => apiClient.get(E.EMAIL_TEMPLATES),
  createTemplate: (d)      => apiClient.post(E.EMAIL_TEMPLATES, d),
  updateTemplate: (id, d)  => apiClient.put(E.EMAIL_TEMPLATE_BY_ID(id), d),
  deleteTemplate: (id)     => apiClient.delete(E.EMAIL_TEMPLATE_BY_ID(id)),
  duplicateTemplate: (id)  => apiClient.post(E.EMAIL_TEMPLATE_DUPLICATE(id)),
  renderTemplate: (id, ctx) => apiClient.post(E.EMAIL_TEMPLATE_RENDER(id), ctx),
};
