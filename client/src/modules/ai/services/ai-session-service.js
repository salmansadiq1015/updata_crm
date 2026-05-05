import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const aiSessionService = {
  create:      (data)            => apiClient.post(ENDPOINTS.AI.SESSIONS, data).then((r) => r.data),
  getById:     (id)              => apiClient.get(ENDPOINTS.AI.SESSION_BY_ID(id)).then((r) => r.data),
  uploadAudio: (id, formData, onProgress) =>
    apiClient.post(ENDPOINTS.AI.SESSION_AUDIO(id), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
      onUploadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded * 100) / e.total));
      },
    }).then((r) => r.data),
  correct:     (id, corrections) => apiClient.patch(ENDPOINTS.AI.SESSION_CORRECT(id), corrections).then((r) => r.data),
  confirm:     (id)              => apiClient.post(ENDPOINTS.AI.SESSION_CONFIRM(id)).then((r) => r.data),
  cancel:      (id)              => apiClient.delete(ENDPOINTS.AI.SESSION_CANCEL(id)).then((r) => r.data),
  list:        (params)          => apiClient.get(ENDPOINTS.AI.SESSIONS, { params }).then((r) => r.data),
};
