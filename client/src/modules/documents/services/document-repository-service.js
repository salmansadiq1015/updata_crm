import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function stripEmptyParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export const documentRepositoryService = {
  async listAttachable(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.ATTACHABLE, { params });
    return res.data;
  },

  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.LIST, { params: stripEmptyParams(params) });
    return {
      items: Array.isArray(res.data) ? res.data : [],
      pagination: res.pagination || {},
    };
  },

  async upload(formData) {
    const res = await apiClient.post(ENDPOINTS.DOCUMENTS.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getDownloadUrl(id, { attachment = false } = {}) {
    const url = attachment
      ? `${ENDPOINTS.DOCUMENTS.DOWNLOAD(id)}?attachment=1`
      : ENDPOINTS.DOCUMENTS.DOWNLOAD(id);
    const res = await apiClient.get(url);
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.DOCUMENTS.BY_ID(id));
    return res.data;
  },

  async setArchived(id, archived) {
    const res = archived
      ? await apiClient.post(ENDPOINTS.DOCUMENTS.ARCHIVE(id))
      : await apiClient.delete(ENDPOINTS.DOCUMENTS.ARCHIVE(id));
    return res.data;
  },
};
