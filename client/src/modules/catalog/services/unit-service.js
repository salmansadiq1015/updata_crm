import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const unitService = {
  list: () => apiClient.get(ENDPOINTS.CATALOG.UNITS),
  getByCode: (code) => apiClient.get(ENDPOINTS.CATALOG.UNIT_BY_CODE(code)),
  create: (data) => apiClient.post(ENDPOINTS.CATALOG.UNITS, data),
  update: (code, data) => apiClient.put(ENDPOINTS.CATALOG.UNIT_BY_CODE(code), data),
  remove: (code) => apiClient.delete(ENDPOINTS.CATALOG.UNIT_BY_CODE(code)),
};
