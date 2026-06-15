import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

export const categoryService = {
  list: (params = {}) => apiClient.get(E.CATEGORIES, { params }),
  tree: (params = {}) => apiClient.get(E.CATEGORIES_TREE, { params }),
  selectOptions: (params = {}) => apiClient.get(E.CATEGORIES_SELECT_OPTIONS, { params }),
  getById: (id) => apiClient.get(E.CATEGORY_BY_ID(id)),
  create: (data) => apiClient.post(E.CATEGORIES, data),
  update: (id, data) => apiClient.put(E.CATEGORY_BY_ID(id), data),
  deactivate: (id) => apiClient.patch(E.CATEGORY_DEACTIVATE(id)),
  move: (id, data) => apiClient.patch(E.CATEGORY_MOVE(id), data),
};
