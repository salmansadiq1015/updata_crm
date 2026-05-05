import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { SYNC_CONFIG } from '../constants/mobile-constants';

export const photoService = {
  async uploadPhoto(orderId, formData) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_PHOTOS(orderId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: SYNC_CONFIG.UPLOAD_TIMEOUT,
    });
    return res.data;
  },

  async getPhotos(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_PHOTOS(orderId));
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  },

  async deletePhoto(photoId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.PHOTO_BY_ID(photoId));
    return res.data;
  },
};
