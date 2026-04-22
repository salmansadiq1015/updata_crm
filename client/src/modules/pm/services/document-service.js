import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const documentService = {
  async getDocuments(projectId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.PM.DOCUMENTS(projectId), { params });
    return res.data;
  },

  async getDocumentById(projectId, docId) {
    const res = await apiClient.get(ENDPOINTS.PM.DOCUMENT_BY_ID(projectId, docId));
    return res.data;
  },

  async uploadDocument(projectId, file, { category = 'OTHER', description } = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (description) formData.append('description', description);

    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS(projectId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getDownloadUrl(projectId, docId) {
    const res = await apiClient.get(ENDPOINTS.PM.DOCUMENT_DOWNLOAD(projectId, docId));
    return res.data;
  },

  async updateDocumentMetadata(projectId, docId, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.DOCUMENT_BY_ID(projectId, docId), data);
    return res.data;
  },

  async deleteDocument(projectId, docId) {
    const res = await apiClient.delete(ENDPOINTS.PM.DOCUMENT_BY_ID(projectId, docId));
    return res.data;
  },

  async generateDocument(projectId, templateType) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_GENERATE(projectId), { templateType });
    return res.data;
  },
};
