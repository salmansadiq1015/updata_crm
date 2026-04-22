import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Polymorphic note service — operates on notes attached to sites or installations.
 * entityType: 'site' | 'installation'
 */
export const noteService = {
  async listByEntity(entityType, entityId) {
    const url = entityType === 'site'
      ? ENDPOINTS.CRM.SITE_NOTES(entityId)
      : ENDPOINTS.CRM.INSTALLATION_NOTES(entityId);
    const res = await apiClient.get(url);
    return res.data;
  },
  async createForEntity(entityType, entityId, data) {
    const url = entityType === 'site'
      ? ENDPOINTS.CRM.SITE_NOTES(entityId)
      : ENDPOINTS.CRM.INSTALLATION_NOTES(entityId);
    const res = await apiClient.post(url, data);
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.NOTE_BY_ID(id), data);
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.NOTE_BY_ID(id));
    return res.data;
  },
};
