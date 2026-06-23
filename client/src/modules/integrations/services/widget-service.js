import apiClient from '@/lib/api/client';
import { API_URL } from '@/lib/api/config';
import { ENDPOINTS } from '@/lib/api/endpoints';

async function parsePublicResponse(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json?.message || json?.error || 'Widget request failed';
    throw new Error(message);
  }
  return json?.data ?? json;
}

function publicUrl(endpoint) {
  return `${API_URL}${endpoint}`;
}

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

export const widgetPublicService = {
  async getConfig(widgetId) {
    const endpoint = ENDPOINTS.INTEGRATIONS.WIDGET_PUBLIC_CONFIG(encodeURIComponent(widgetId || 'default'));
    const response = await fetch(publicUrl(endpoint));
    return parsePublicResponse(response);
  },

  async submit(body) {
    const response = await fetch(publicUrl(ENDPOINTS.INTEGRATIONS.WIDGET_PUBLIC_SUBMIT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return parsePublicResponse(response);
  },

  async uploadAttachment(submissionId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(publicUrl(ENDPOINTS.INTEGRATIONS.WIDGET_PUBLIC_ATTACHMENT(submissionId)), {
      method: 'POST',
      body: formData,
    });
    return parsePublicResponse(response);
  },
};
