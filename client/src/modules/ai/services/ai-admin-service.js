import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const aiAdminService = {
  // Vocabulary
  listVocabulary: (params) => apiClient.get(ENDPOINTS.AI.VOCABULARY, { params }).then((r) => r.data),
  createVocabulary: (data) => apiClient.post(ENDPOINTS.AI.VOCABULARY, data).then((r) => r.data),
  updateVocabulary: (id, data) => apiClient.put(ENDPOINTS.AI.VOCABULARY_BY_ID(id), data).then((r) => r.data),
  deleteVocabulary: (id) => apiClient.delete(ENDPOINTS.AI.VOCABULARY_BY_ID(id)).then((r) => r.data),

  // Commands
  listCommands: (params) => apiClient.get(ENDPOINTS.AI.COMMANDS, { params }).then((r) => r.data),
  createCommand: (data) => apiClient.post(ENDPOINTS.AI.COMMANDS, data).then((r) => r.data),
  updateCommand: (id, data) => apiClient.put(ENDPOINTS.AI.COMMANDS_BY_ID(id), data).then((r) => r.data),
  deleteCommand: (id) => apiClient.delete(ENDPOINTS.AI.COMMANDS_BY_ID(id)).then((r) => r.data),

  // Analytics
  getAccuracy: (params) => apiClient.get(ENDPOINTS.AI.ANALYTICS_ACCURACY, { params }).then((r) => r.data),
  getUsage: (params) => apiClient.get(ENDPOINTS.AI.ANALYTICS_USAGE, { params }).then((r) => r.data),
  getTopCorrections: (params) => apiClient.get(ENDPOINTS.AI.ANALYTICS_CORRECTIONS, { params }).then((r) => r.data),

  // Documents
  previewDocument: (data) => apiClient.post(ENDPOINTS.AI.DOCUMENT_PREVIEW, data).then((r) => r.data),
  generateDocument: (data) => apiClient.post(ENDPOINTS.AI.DOCUMENT_GENERATE, data).then((r) => r.data),
};
