import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const prepActionService = {
  async getPrepActions(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTIONS(projectId));
    return res.data;
  },

  async getPrepActionById(projectId, actionId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId));
    return res.data;
  },

  async createPrepAction(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.PM.PREP_ACTIONS(projectId), data);
    return res.data;
  },

  async updatePrepAction(projectId, actionId, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId), data);
    return res.data;
  },

  async deletePrepAction(projectId, actionId) {
    const res = await apiClient.delete(ENDPOINTS.PM.PREP_ACTION_BY_ID(projectId, actionId));
    return res.data;
  },

  async getAttachments(projectId, actionId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTION_ATTACHMENTS(projectId, actionId));
    return res.data;
  },

  async uploadAttachment(projectId, actionId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(
      ENDPOINTS.PM.PREP_ACTION_ATTACHMENTS(projectId, actionId),
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  async getAttachmentDownloadUrl(projectId, actionId, fileId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTION_ATTACHMENT_DOWNLOAD(projectId, actionId, fileId));
    return res.data;
  },

  async getHistory(projectId, actionId) {
    const res = await apiClient.get(ENDPOINTS.PM.PREP_ACTION_HISTORY(projectId, actionId));
    return res.data;
  },
};
