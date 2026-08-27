import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const ingestionService = {
  overview: () => apiClient.get(ENDPOINTS.DOCUMENTS.INGESTION).then((r) => r.data),
  save: (key, payload) => apiClient.put(ENDPOINTS.DOCUMENTS.INGESTION_SOURCE(key), payload).then((r) => r.data),
  test: (key, config) => apiClient.post(ENDPOINTS.DOCUMENTS.INGESTION_TEST(key), config ? { config } : {}).then((r) => r.data),
  runNow: (key) => apiClient.post(ENDPOINTS.DOCUMENTS.INGESTION_RUN(key)).then((r) => r.data),
};

export default ingestionService;
