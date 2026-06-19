import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const chatService = {
  async getMessages(projectId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.PROJECT_CHAT(projectId), { params });
    return res.data;
  },

  async getMembers(projectId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.PROJECT_CHAT_MEMBERS(projectId));
    return res.data;
  },

  async sendMessage(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.PROJECT_CHAT(projectId), data);
    return res.data;
  },

  async uploadAttachment(projectId, file, messageType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', 'chat');
    formData.append('entityType', 'project');
    formData.append('entityId', projectId);
    formData.append('bucket', messageType === 'PHOTO' ? 'photos' : 'documents');
    formData.append('category', 'chat');

    const res = await apiClient.post(ENDPOINTS.FILES.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const fileData = res.data || {};
    return {
      attachmentUrl: fileData.url || fileData.fileUrl || fileData.attachmentUrl || null,
      attachmentFileId: fileData._id || fileData.id || fileData.attachmentFileId || null,
      file: fileData,
    };
  },

  async markRead(messageId) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.CHAT_READ(messageId));
    return res.data;
  },
};
