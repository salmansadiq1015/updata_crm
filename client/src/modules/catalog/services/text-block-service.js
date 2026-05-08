import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

export const textBlockService = {
  list: (params = {}) => apiClient.get(E.TEXT_BLOCKS, { params }),
  getById: (id) => apiClient.get(E.TEXT_BLOCK_BY_ID(id)),
  create: (data) => apiClient.post(E.TEXT_BLOCKS, data),
  update: (id, data) => apiClient.put(E.TEXT_BLOCK_BY_ID(id), data),
  remove: (id) => apiClient.delete(E.TEXT_BLOCK_BY_ID(id)),
};
