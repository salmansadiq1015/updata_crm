import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const catalogService = {
  async search(query, source = 'ALL', category, limit = 50) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.CATALOG_SEARCH, {
      params: { query, source, category, limit },
    });
    return res.data;
  },

  async syncCatalog(since) {
    const params = since ? { since } : {};
    const res = await apiClient.get(ENDPOINTS.MOBILE.CATALOG_SYNC, { params });
    return res.data;
  },

  async getFavorites() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.CATALOG_FAVORITES);
    return res.data;
  },

  async addFavorite(itemId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.CATALOG_FAVORITE(itemId));
    return res.data;
  },

  async removeFavorite(itemId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.CATALOG_FAVORITE(itemId));
    return res.data;
  },

  async getRecent() {
    const res = await apiClient.get(ENDPOINTS.MOBILE.CATALOG_RECENT);
    return res.data;
  },
};
