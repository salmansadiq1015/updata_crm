import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/** Kundenkontakthistorie — logged exchanges with a customer. */
export const contactLogService = {
  /** Central view: everything logged for a customer. */
  async listByCustomer(customerId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.CONTACT_LOG.BY_CUSTOMER(customerId), { params });
    return res.data;
  },

  /** Scoped view: the exchanges naming one object / project / order / assignment. */
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CONTACT_LOG.LIST, { params });
    return res.data;
  },

  async create(customerId, data) {
    const res = await apiClient.post(ENDPOINTS.CONTACT_LOG.BY_CUSTOMER(customerId), data);
    return res.data;
  },

  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CONTACT_LOG.BY_ID(id), data);
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.CONTACT_LOG.BY_ID(id));
    return res.data;
  },
};
