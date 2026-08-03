import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.VEHICLES;

export const vehicleService = {
  list:        (params = {}) => apiClient.get(E.LIST, { params }).then((r) => r.data),
  getById:     (id)          => apiClient.get(E.BY_ID(id)).then((r) => r.data),
  create:      (data)        => apiClient.post(E.LIST, data).then((r) => r.data),
  update:      (id, data)    => apiClient.patch(E.BY_ID(id), data).then((r) => r.data),
  remove:      (id)          => apiClient.delete(E.BY_ID(id)).then((r) => r.data),
  assignDriver:(id, driverId)=> apiClient.put(E.DRIVER(id), { driverId }).then((r) => r.data),

  listServices:(id)          => apiClient.get(E.SERVICES(id)).then((r) => r.data),
  addService:  (id, data)    => apiClient.post(E.SERVICES(id), data).then((r) => r.data),
  deleteService:(id, subId)  => apiClient.delete(E.SERVICE_BY_ID(id, subId)).then((r) => r.data),

  listMaterials:(id)         => apiClient.get(E.MATERIALS(id)).then((r) => r.data),
  addMaterial: (id, data)    => apiClient.post(E.MATERIALS(id), data).then((r) => r.data),
  deleteMaterial:(id, subId) => apiClient.delete(E.MATERIAL_BY_ID(id, subId)).then((r) => r.data),

  listNotes:   (id)          => apiClient.get(E.NOTES(id)).then((r) => r.data),
  addNote:     (id, data)    => apiClient.post(E.NOTES(id), data).then((r) => r.data),
  deleteNote:  (id, subId)   => apiClient.delete(E.NOTE_BY_ID(id, subId)).then((r) => r.data),

  listHistory: (id)          => apiClient.get(E.HISTORY(id)).then((r) => r.data),
};
