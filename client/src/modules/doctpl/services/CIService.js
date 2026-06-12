import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.DOCTPL;
export const ciService = {
  getConfig:    ()    => apiClient.get(E.CI_CONFIG),
  updateConfig: (d)   => apiClient.put(E.CI_CONFIG, d),
  getAudit:     ()    => apiClient.get(E.CI_AUDIT),
  listAssets:   ()    => apiClient.get(E.CI_ASSETS),
  uploadAsset:  (fd)  => apiClient.post(E.CI_ASSETS, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAsset:  (id)  => apiClient.delete(E.CI_ASSET_BY_ID(id)),
};
