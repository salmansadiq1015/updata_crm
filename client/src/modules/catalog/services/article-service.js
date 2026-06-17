import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { normalizeArticlePayload } from './catalog-normalizers';

const E = ENDPOINTS.CATALOG;

export const articleService = {
  list: (params = {}) => apiClient.get(E.ARTICLES, { params }),
  getById: (id) => apiClient.get(E.ARTICLE_BY_ID(id)),
  create: (data) => apiClient.post(E.ARTICLES, normalizeArticlePayload(data)),
  update: (id, data) => apiClient.put(E.ARTICLE_BY_ID(id), normalizeArticlePayload(data, { partial: true })),
  remove: (id) => apiClient.delete(E.ARTICLE_BY_ID(id)),
  getVersions: (id) => apiClient.get(E.ARTICLE_VERSIONS(id)),
  updatePrice: (data) => apiClient.post(E.PRICE_UPDATE, data),
  getPriceHistory: (id) => apiClient.get(E.PRICE_HISTORY(id)),
  bulkImport: ({ file, format } = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (format) form.append('format', format);
    return apiClient.post(E.ARTICLES_IMPORT, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importTemplateUrl: () => E.ARTICLES_IMPORT_TEMPLATE,
  downloadImportTemplate: () => apiClient.get(E.ARTICLES_IMPORT_TEMPLATE, { responseType: 'blob' }),
  getFacets: (params = {}) => apiClient.get(E.ARTICLES_FACETS, { params }),
  getRecentSearches: (params = {}) => apiClient.get(E.SEARCH_RECENT, { params }),
  picker: (query) => apiClient.get(E.PICKER_ARTICLES, { params: { q: query } }),
  recordUse: (id) => apiClient.post(E.PICKER_ARTICLE_USE(id)),
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
