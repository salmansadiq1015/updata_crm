import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const profileService = {
  async getProfile() {
    const res = await apiClient.get(ENDPOINTS.USERS.ME);
    return res.data;
  },

  async updateProfile(data) {
    const res = await apiClient.put(ENDPOINTS.USERS.ME, data);
    return res.data;
  },
};
