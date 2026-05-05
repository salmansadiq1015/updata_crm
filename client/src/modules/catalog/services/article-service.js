import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

export const articleService = {
  list: (params = {}) => apiClient.get(E.ARTICLES, { params }),
  getById: (id) => apiClient.get(E.ARTICLE_BY_ID(id)),
  create: (data) => apiClient.post(E.ARTICLES, data),
  update: (id, data) => apiClient.put(E.ARTICLE_BY_ID(id), data),
  remove: (id) => apiClient.delete(E.ARTICLE_BY_ID(id)),
  getVersions: (id) => apiClient.get(E.ARTICLE_VERSIONS(id)),
  updatePrice: (data) => apiClient.post(E.PRICE_UPDATE, data),
  getPriceHistory: (id) => apiClient.get(E.PRICE_HISTORY(id)),
  picker: (query) => apiClient.get(E.PICKER, { params: { q: query } }),
};
