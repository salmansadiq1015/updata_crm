import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const emailService = {
  compose: (d)    => apiClient.post(E.EMAIL_COMPOSE, d),
  send:    (d)    => apiClient.post(E.EMAIL_SEND, d),
  list:    (p={}) => apiClient.get(E.EMAILS, { params: p }),
  getById: (id)   => apiClient.get(E.EMAIL_BY_ID(id)),
  retry:   (id)   => apiClient.post(E.EMAIL_RETRY(id)),
};
