import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const ighService = {
  getConfig: () => apiClient.get(ENDPOINTS.CATALOG.IGH_CONFIG),
  saveConfig: (data) => apiClient.put(ENDPOINTS.CATALOG.IGH_CONFIG, data),
  previewImport: (type = 'FULL') => apiClient.post(ENDPOINTS.CATALOG.IGH_IMPORT_PREVIEW, { type }),
  uploadCatalogFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(ENDPOINTS.CATALOG.IGH_IMPORT_UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180_000,
    });
  },
  approveImport: (jobId) => apiClient.post(ENDPOINTS.CATALOG.IGH_IMPORT_APPROVE(jobId)),
  importFull: () => apiClient.post(ENDPOINTS.CATALOG.IGH_IMPORT_FULL),
  importDelta: () => apiClient.post(ENDPOINTS.CATALOG.IGH_IMPORT_DELTA),
  getImportHistory: () => apiClient.get(ENDPOINTS.CATALOG.IGH_IMPORT_HISTORY),
  getImportJob: (jobId) => apiClient.get(ENDPOINTS.CATALOG.IGH_IMPORT_BY_ID(jobId)),
};
