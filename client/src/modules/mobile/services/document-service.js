import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { SYNC_CONFIG } from '../constants/mobile-constants';

export const documentService = {
  async getDocuments(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_DOCUMENTS(orderId));
    return res.data;
  },

  async uploadDocument(orderId, formData) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_DOCUMENTS(orderId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: SYNC_CONFIG.UPLOAD_TIMEOUT,
    });
    return res.data;
  },

  async getDownloadUrl(orderId, docId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.DOCUMENT_DOWNLOAD(orderId, docId));
    return res.data;
  },
};
