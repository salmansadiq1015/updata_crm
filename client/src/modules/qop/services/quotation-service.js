import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const quotationService = {
  list:          (params = {}) => apiClient.get(E.QUOTATIONS, { params }),
  getById:       (id)          => apiClient.get(E.QUOTATION_BY_ID(id)),
  create:        (data)        => apiClient.post(E.QUOTATIONS, data),
  update:        (id, data)    => apiClient.put(E.QUOTATION_BY_ID(id), data),
  remove:        (id)          => apiClient.delete(E.QUOTATION_BY_ID(id)),
  duplicate:     (id)          => apiClient.post(E.QUOTATION_DUPLICATE(id)),
  send:          (id)          => apiClient.post(E.QUOTATION_SEND(id)),
  convert:       (id, body = {}) => apiClient.post(E.QUOTATION_CONVERT(id), body),
  transitionStatus: (id, targetStatus, reason) =>
    apiClient.patch(E.QUOTATION_STATUS(id), { targetStatus, reason }),
  generateDocument: (id)       => apiClient.post(E.QUOTATION_GENERATE_DOC(id)),
  getHistory:    (id)          => apiClient.get(E.QUOTATION_HISTORY(id)),
  getRevisions:  (id)          => apiClient.get(E.QUOTATION_REVISIONS(id)),
  snoozeReminder:(id, remId, snoozedUntil) =>
    apiClient.post(E.QUOTATION_SNOOZE_REMINDER(id, remId), { snoozedUntil }),
  listReminders: (params = {}) => apiClient.get(`${E.QUOTATIONS}/reminders`, { params }),
};
