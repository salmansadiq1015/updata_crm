import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { normalizeFieldTicketPage } from '@/modules/field-ops/utils/field-ticket-utils';

export const ticketService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.TICKETS, { params });
    return normalizeFieldTicketPage(res.data);
  },

  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.TICKET_BY_ID(id));
    return res.data;
  },

  async create(data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.TICKETS, data);
    return res.data;
  },

  async changeStatus(id, status) {
    const res = await apiClient.patch(ENDPOINTS.MOBILE.TICKET_STATUS(id), { status });
    return res.data;
  },

  async addComment(id, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.TICKET_COMMENTS(id), data);
    return res.data;
  },
};
