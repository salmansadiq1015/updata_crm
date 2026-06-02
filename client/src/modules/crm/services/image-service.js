import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Resolve the collection endpoint for an entity's images.
 * @param {'site'|'installation'|'customer'} entityType
 * @param {string} entityId
 * @returns {string}
 */
function entityImagesUrl(entityType, entityId) {
  switch (entityType) {
    case 'site':
      return ENDPOINTS.CRM.SITE_IMAGES(entityId);
    case 'customer':
      return ENDPOINTS.CRM.CUSTOMER_IMAGES(entityId);
    case 'installation':
    default:
      return ENDPOINTS.CRM.INSTALLATION_IMAGES(entityId);
  }
}

/**
 * Polymorphic image service — multipart upload for site, installation or customer images.
 * entityType: 'site' | 'installation' | 'customer'
 */
export const imageService = {
  async listByEntity(entityType, entityId) {
    const url = entityImagesUrl(entityType, entityId);
    const res = await apiClient.get(url);
    return res.data;
  },
  async uploadForEntity(entityType, entityId, file, meta = {}) {
    const url = entityImagesUrl(entityType, entityId);

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
