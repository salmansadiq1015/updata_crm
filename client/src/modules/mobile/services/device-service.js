import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const deviceService = {
  async registerDevice(data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.DEVICE_REGISTER, data);
    return res.data;
  },

  async deactivateDevice(deviceId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.DEVICE_BY_ID(deviceId));
    return res.data;
  },
};
