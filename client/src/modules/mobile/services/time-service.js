import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const timeService = {
  async createTimeEntry(orderId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_TIME_ENTRIES(orderId), data);
    return res.data;
  },

  async getTimeEntries(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.TIME_ENTRIES, { params });
    return res.data;
  },

  async updateTimeEntry(entryId, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.TIME_ENTRY_BY_ID(entryId), data);
    return res.data;
  },

  async deleteTimeEntry(entryId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.TIME_ENTRY_BY_ID(entryId));
    return res.data;
  },

  async releaseTimeEntry(entryId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.TIME_ENTRY_RELEASE(entryId));
    return res.data;
  },
};
