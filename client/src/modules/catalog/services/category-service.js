import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

export const categoryService = {
  list: () => apiClient.get(E.CATEGORIES),
  getById: (id) => apiClient.get(E.CATEGORY_BY_ID(id)),
  create: (data) => apiClient.post(E.CATEGORIES, data),
  update: (id, data) => apiClient.put(E.CATEGORY_BY_ID(id), data),
  deactivate: (id) => apiClient.patch(E.CATEGORY_DEACTIVATE(id)),
  move: (id, data) => apiClient.patch(E.CATEGORY_MOVE(id), data),
};
