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

  async restoreDocument(projectId, docId) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENT_RESTORE(projectId, docId));
    return res.data;
  },

  // Visum (sign-off): visiert=true signs off, false clears it.
  async setVisum(projectId, docId, visiert = true) {
    const url = ENDPOINTS.PM.DOCUMENT_VISUM(projectId, docId);
    const res = visiert ? await apiClient.post(url) : await apiClient.delete(url);
    return res.data;
  },

  // Digitales Dossier: released=true makes the document visible to the field.
  async setReleased(projectId, docId, released = true) {
    const url = ENDPOINTS.PM.DOCUMENT_RELEASE(projectId, docId);
    const res = released ? await apiClient.post(url) : await apiClient.delete(url);
    return res.data;
  },

  // Archive: archived=true moves to Archiv, false restores it.
  async setArchived(projectId, docId, archived = true) {
    const url = ENDPOINTS.PM.DOCUMENT_ARCHIVE(projectId, docId);
    const res = archived ? await apiClient.post(url) : await apiClient.delete(url);
    return res.data;
  },

  async generateDocument(projectId, { templateType, overrides = {}, draftId = null } = {}) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_GENERATE(projectId), {
      templateType,
      overrides,
      ...(draftId ? { draftId } : {}),
    });
    return res.data;
  },

  async previewDocument(projectId, { templateType, overrides = {} } = {}) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_PREVIEW(projectId), {
      templateType,
      overrides,
    });
    return res.data;
  },

  async saveDraft(projectId, { templateType, overrides = {}, draftId = null } = {}) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_DRAFT(projectId), {
      templateType,
      overrides,
      ...(draftId ? { draftId } : {}),
    });
    return res.data;
  },

  async emailDocument(projectId, docId, { to, message } = {}) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENT_EMAIL(projectId, docId), { to, message });
    return res.data;
  },
};
