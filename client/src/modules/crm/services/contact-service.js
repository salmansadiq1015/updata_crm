import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const contactService = {
  async listByCustomer(customerId) {
    const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_CONTACTS(customerId));
    return res.data;
  },
  async createForCustomer(customerId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.CUSTOMER_CONTACTS(customerId), data);
    return res.data;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.CONTACT_BY_ID(id));
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.CONTACT_BY_ID(id), data);
    return res.data;
  },
  async delete(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.CONTACT_BY_ID(id));
    return res.data;
  },
  async setPrimary(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.CONTACT_SET_PRIMARY(id));
    return res.data;
  },
  async search(q, limit = 25) {
    const res = await apiClient.get(ENDPOINTS.CRM.CONTACTS_SEARCH, { params: { q, limit } });
    return res.data;
  },
  /**
   * Bulk-delete via parallel single DELETEs — backend has no bulk endpoint for contacts.
   * Mirrors the pattern in roleService.bulkDeleteRoles.
   */
  async bulkDelete(ids) {
    const results = await Promise.allSettled(
      ids.map((id) => apiClient.delete(ENDPOINTS.CRM.CONTACT_BY_ID(id))),
    );
    const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { deletedCount, failed };
  },
};
