import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const widgetService = {
  async listSubmissions(params = {}) {
    const res = await apiClient.get(ENDPOINTS.INTEGRATIONS.WIDGET_SUBMISSIONS, { params });
    return res;
  },
  async getSubmission(id) {
    const res = await apiClient.get(ENDPOINTS.INTEGRATIONS.WIDGET_SUBMISSION_BY_ID(id));
    return res.data;
  },
  async markProcessed(id, body = {}) {
    const res = await apiClient.post(ENDPOINTS.INTEGRATIONS.WIDGET_SUBMISSION_PROCESS(id), body);
    return res.data;
  },
  async getConfig() {
    const res = await apiClient.get(ENDPOINTS.INTEGRATIONS.WIDGET_CONFIG);
    return res.data;
  },
  async updateConfig(body) {
    const res = await apiClient.put(ENDPOINTS.INTEGRATIONS.WIDGET_CONFIG, body);
    return res.data;
  },
};
