import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.INTEGRATIONS;

export const integrationService = {
  list: () => apiClient.get(E.LIST),
  dashboard: () => apiClient.get(E.DASHBOARD),
  getByKey: (key) => apiClient.get(E.BY_KEY(key)),
  updateConfig: (key, data) => apiClient.put(E.CONFIG(key), data),
  enable: (key) => apiClient.post(E.ENABLE(key)),
  disable: (key) => apiClient.post(E.DISABLE(key)),
  healthCheck: (key) => apiClient.post(E.HEALTH_CHECK(key)),
  healthHistory: (key, params = {}) => apiClient.get(E.HEALTH_HISTORY(key), { params }),
  syncHistory: (key, params = {}) => apiClient.get(E.SYNC_HISTORY(key), { params }),
};
