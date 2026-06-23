import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.NOTIFICATIONS;

function listPayload(response) {
  return {
    items: response?.data || [],
    pagination: response?.pagination || { hasNext: false, nextCursor: null },
  };
}

export const notificationAdminService = {
  async getHistory(params = {}) {
    return listPayload(await apiClient.get(E.HISTORY, { params }));
  },

  async exportHistory(params = {}) {
    const response = await apiClient.get(E.HISTORY_EXPORT, {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  async anonymizeHistory(payload) {
    const response = await apiClient.post(E.HISTORY_ANONYMIZE, payload);
    return response.data;
  },

  async getMetrics(params = {}) {
    const response = await apiClient.get(E.METRICS, { params });
    return response.data;
  },

  async listTemplates(params = {}) {
    return listPayload(await apiClient.get(E.TEMPLATES, { params }));
  },

  async createTemplate(payload) {
    const response = await apiClient.post(E.TEMPLATES, payload);
    return response.data;
  },

  async updateTemplate(id, payload) {
    const response = await apiClient.put(E.TEMPLATE_BY_ID(id), payload);
    return response.data;
  },

  async previewTemplate(id, sampleData) {
    const response = await apiClient.post(E.TEMPLATE_PREVIEW(id), { sampleData });
    return response.data;
  },

  async removeTemplate(id) {
    const response = await apiClient.delete(E.TEMPLATE_BY_ID(id));
    return response.data;
  },

  async listScheduled(params = {}) {
    return listPayload(await apiClient.get(E.SCHEDULED, { params }));
  },

  async createScheduled(payload) {
    const response = await apiClient.post(E.SCHEDULED, payload);
    return response.data;
  },

  async cancelScheduled(id) {
    const response = await apiClient.post(E.SCHEDULED_CANCEL(id));
    return response.data;
  },

  async pauseScheduled(id) {
    const response = await apiClient.post(E.SCHEDULED_PAUSE(id));
    return response.data;
  },

  async resumeScheduled(id) {
    const response = await apiClient.post(E.SCHEDULED_RESUME(id));
    return response.data;
  },

  async flagStaleDeliveries(payload) {
    const response = await apiClient.post(E.DELIVERIES_FLAG_STALE, payload);
    return response.data;
  },
};
