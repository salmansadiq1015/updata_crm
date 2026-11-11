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

  async setVisum(id, visiert) {
    const url = ENDPOINTS.DOCUMENTS.VISUM(id);
    const res = visiert ? await apiClient.post(url) : await apiClient.delete(url);
    return res.data;
  },

  async setReleased(id, released) {
    const url = ENDPOINTS.DOCUMENTS.RELEASE(id);
    const res = released ? await apiClient.post(url) : await apiClient.delete(url);
    return res.data;
  },

  async stats() {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.STATS);
    return res.data;
  },

  async facets() {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.FACETS);
    return res.data || { documentTypes: [], categories: [] };
  },

  async linkTargets(type, search = '') {
    const res = await apiClient.get(ENDPOINTS.DOCUMENTS.LINK_TARGETS, { params: stripEmptyParams({ type, search }) });
    return Array.isArray(res.data) ? res.data : [];
  },

  async update(id, changes) {
    const res = await apiClient.patch(ENDPOINTS.DOCUMENTS.BY_ID(id), changes);
    return res.data;
  },

  async bulk(action, ids) {
    const res = await apiClient.post(ENDPOINTS.DOCUMENTS.BULK, { action, ids });
    return res.data;
  },

  async setArchived(id, archived) {
    const res = archived
      ? await apiClient.post(ENDPOINTS.DOCUMENTS.ARCHIVE(id))
      : await apiClient.delete(ENDPOINTS.DOCUMENTS.ARCHIVE(id));
    return res.data;
  },
};
