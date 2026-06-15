import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

export const priceService = {
  getHistory: (articleId) => apiClient.get(E.PRICE_HISTORY(articleId)),
  getBatches: (params = {}) => apiClient.get(E.PRICE_BATCHES, { params }),
  preview: (payload) => apiClient.post(E.PRICE_PREVIEW, payload),
  update: (payload) => apiClient.post(E.PRICE_UPDATE, payload),
  schedule: (payload) => apiClient.post(E.PRICE_SCHEDULE, payload),
  rollback: (batchId) => apiClient.post(E.PRICE_ROLLBACK(batchId)),
};
