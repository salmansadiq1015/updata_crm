import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Polymorphic image service — multipart upload for site or installation images.
 * entityType: 'site' | 'installation'
 */
export const imageService = {
  async listByEntity(entityType, entityId) {
    const url = entityType === 'site'
      ? ENDPOINTS.CRM.SITE_IMAGES(entityId)
      : ENDPOINTS.CRM.INSTALLATION_IMAGES(entityId);
    const res = await apiClient.get(url);
    return res.data;
  },
  async uploadForEntity(entityType, entityId, file, meta = {}) {
    const url = entityType === 'site'
      ? ENDPOINTS.CRM.SITE_IMAGES(entityId)
      : ENDPOINTS.CRM.INSTALLATION_IMAGES(entityId);

    const form = new FormData();
    form.append('image', file);
    if (meta.caption) form.append('caption', meta.caption);
    if (meta.category) form.append('category', meta.category);
    if (meta.sortOrder != null) form.append('sortOrder', String(meta.sortOrder));

    const res = await apiClient.post(url, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.IMAGE_BY_ID(id));
    return res.data;
  },
};
