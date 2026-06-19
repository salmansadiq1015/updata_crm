import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { normalizeFieldTicketPage } from '@/modules/field-ops/utils/field-ticket-utils';

export const fieldTicketService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.FIELD_TICKETS.LIST, { params });
    return normalizeFieldTicketPage(res.data);
  },

  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.FIELD_TICKETS.BY_ID(id));
    return res.data;
  },

  async create(data) {
    const res = await apiClient.post(ENDPOINTS.FIELD_TICKETS.LIST, data);
    return res.data;
  },

  async update(id, data) {
    const res = await apiClient.put(ENDPOINTS.FIELD_TICKETS.BY_ID(id), data);
    return res.data;
  },

  async changeStatus(id, status) {
    const res = await apiClient.patch(ENDPOINTS.FIELD_TICKETS.STATUS(id), { status });
    return res.data;
  },

  async assign(id, data) {
    const res = await apiClient.patch(ENDPOINTS.FIELD_TICKETS.ASSIGN(id), data);
    return res.data;
  },

  async addComment(id, data) {
    const res = await apiClient.post(ENDPOINTS.FIELD_TICKETS.COMMENTS(id), data);
    return res.data;
  },

  async addAttachment(id, data) {
    const res = await apiClient.post(ENDPOINTS.FIELD_TICKETS.ATTACHMENTS(id), data);
    return res.data;
  },

  async analyze(id) {
    const res = await apiClient.post(ENDPOINTS.FIELD_TICKETS.AI_ANALYZE(id));
    return res.data;
  },
};
