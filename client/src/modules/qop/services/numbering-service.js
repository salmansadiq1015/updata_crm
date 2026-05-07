import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.QOP;
export const numberingService = {
  list:    ()          => apiClient.get(E.NUMBER_SEQUENCES),
  update:  (id, data)  => apiClient.put(`${E.NUMBER_SEQUENCES}/${id}`, data),
  preview: (format)    => apiClient.post(`${E.NUMBER_SEQUENCES}/preview`, format),
};
