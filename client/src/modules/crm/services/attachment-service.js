// client/src/modules/crm/services/attachment-service.js
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const attachmentService = {
  async list(customerId) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_ATTACHMENTS(customerId));
    return res.data;
  },

  async upload(customerId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(
      ENDPOINTS.CRM.CUSTOMER_ATTACHMENTS(customerId),
      formData,
    );
    return res.data;
  },

  async rename(customerId, fileId, originalName) {
    const res = await apiClient.patch(
      ENDPOINTS.CRM.CUSTOMER_ATTACHMENT_BY_ID(customerId, fileId),
      { originalName },
    );
    return res.data;
  },

  async remove(customerId, fileId) {
    const res = await apiClient.delete(
      ENDPOINTS.CRM.CUSTOMER_ATTACHMENT_BY_ID(customerId, fileId),
    );
    return res.data;
  },

  async bulkRemove(customerId, fileIds) {
    const res = await apiClient.post(
      ENDPOINTS.CRM.CUSTOMER_ATTACHMENTS_BULK_DELETE(customerId),
      { fileIds },
    );
    return res.data;
  },

  async getDownloadUrl(fileId) {
    const res = await apiClient.get(ENDPOINTS.FILES.DOWNLOAD(fileId));
    return res.data?.url ?? null;
  },
};
