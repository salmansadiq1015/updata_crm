import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const chatService = {
  async getMessages(projectId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.PROJECT_CHAT(projectId), { params });
    return res.data;
  },

  async sendMessage(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.PROJECT_CHAT(projectId), data);
    return res.data;
  },

  async markRead(messageId) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.CHAT_READ(messageId));
    return res.data;
  },
};
