import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/**
 * Newsletter API service — thin axios wrappers.
 * List endpoints return the full envelope (to preserve `.pagination`).
 * Detail / mutation endpoints return `res.data` directly.
 */
export const newsletterService = {
  async getNewsletters(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.NEWSLETTERS, { params });
    return res;
  },

  async getNewsletterById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.NEWSLETTER_BY_ID(id));
    return res.data;
  },

  async createNewsletter(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTERS, data);
    return res.data;
  },

  async updateNewsletter(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.NEWSLETTER_BY_ID(id), data);
    return res.data;
  },

  async deleteNewsletter(id) {
    const res = await apiClient.delete(ENDPOINTS.CRM.NEWSLETTER_BY_ID(id));
    return res.data;
  },

  async scheduleNewsletter(id, scheduledAt) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTER_SCHEDULE(id), { scheduledAt });
    return res.data;
  },

  async cancelNewsletter(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTER_CANCEL(id));
    return res.data;
  },

  async sendNewsletter(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTER_SEND(id));
    return res.data;
  },

  async revertToDraft(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTER_REVERT(id));
    return res.data;
  },

  async getStats(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.NEWSLETTER_STATS(id));
    return res.data;
  },

  async countRecipients(recipientFilter = {}) {
    const res = await apiClient.post(ENDPOINTS.CRM.NEWSLETTER_COUNT_RECIPIENTS, { recipientFilter });
    return res.data;
  },
};
