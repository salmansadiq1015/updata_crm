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
  bulkImport: (formData) =>
    apiClient.post(E.ARTICLES_IMPORT, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  picker: (query) => apiClient.get(E.PICKER, { params: { q: query } }),
  listImages: (articleId) => apiClient.get(E.ARTICLE_IMAGES(articleId)),
  uploadImage: (articleId, file) => {
    const form = new FormData();
    form.append('image', file);
    return apiClient.post(E.ARTICLE_IMAGES(articleId), form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteImage: (articleId, imageId) =>
    apiClient.delete(E.ARTICLE_IMAGE(articleId, imageId)),
};
