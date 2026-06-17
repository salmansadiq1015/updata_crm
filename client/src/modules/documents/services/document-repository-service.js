import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function stripEmptyParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export const documentRepositoryService = {
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

  async getDownloadUrl(id) {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.DOWNLOAD(id));
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.DOCUMENTS.BY_ID(id));
    return res.data;
  },
};
