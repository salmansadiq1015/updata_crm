import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { SYNC_CONFIG } from '../constants/mobile-constants';

export const syncService = {
  async sync(payload) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.SYNC, payload, {
      timeout: SYNC_CONFIG.SYNC_TIMEOUT,
    });
    return res.data;
  },

  async getSyncStatus() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.SYNC_STATUS);
    return res.data;
  },
};
