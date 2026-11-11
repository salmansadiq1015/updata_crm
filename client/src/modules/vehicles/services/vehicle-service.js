import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.VEHICLES;
const body = (r) => r.data;

export const vehicleService = {
  list:        (params = {}) => apiClient.get(E.LIST, { params }).then(body),
  stats:       ()            => apiClient.get(E.STATS).then(body),
  getById:     (id)          => apiClient.get(E.BY_ID(id)).then(body),
  create:      (data)        => apiClient.post(E.LIST, data).then(body),
  update:      (id, data)    => apiClient.patch(E.BY_ID(id), data).then(body),
  remove:      (id)          => apiClient.delete(E.BY_ID(id)).then(body),
  assignDriver:(id, driverId)=> apiClient.put(E.DRIVER(id), { driverId }).then(body),

  uploadPhoto: (id, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return apiClient.post(E.PHOTO(id), fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(body);
  },
  removePhoto: (id)          => apiClient.delete(E.PHOTO(id)).then(body),

  listServices:(id)          => apiClient.get(E.SERVICES(id)).then(body),
  addService:  (id, data)    => apiClient.post(E.SERVICES(id), data).then(body),
  deleteService:(id, subId)  => apiClient.delete(E.SERVICE_BY_ID(id, subId)).then(body),

  listCosts:   (id, params = {}) => apiClient.get(E.COSTS(id), { params }).then(body),
  addCost:     (id, data)    => apiClient.post(E.COSTS(id), data).then(body),
  deleteCost:  (id, subId)   => apiClient.delete(E.COST_BY_ID(id, subId)).then(body),

  listBookings:(id, params = {}) => apiClient.get(E.BOOKINGS(id), { params }).then(body),
  addBooking:  (id, data)    => apiClient.post(E.BOOKINGS(id), data).then(body),
  cancelBooking:(id, subId)  => apiClient.delete(E.BOOKING_BY_ID(id, subId)).then(body),

  listMaterials:(id)         => apiClient.get(E.MATERIALS(id)).then(body),
  exportMaterialsPdf:(id)    => apiClient.get(E.MATERIALS_EXPORT_PDF(id), { responseType: 'blob' }).then(body),
  addMaterial: (id, data)    => apiClient.post(E.MATERIALS(id), data).then(body),
  deleteMaterial:(id, subId) => apiClient.delete(E.MATERIAL_BY_ID(id, subId)).then(body),

  listNotes:   (id)          => apiClient.get(E.NOTES(id)).then(body),
  addNote:     (id, data)    => apiClient.post(E.NOTES(id), data).then(body),
  deleteNote:  (id, subId)   => apiClient.delete(E.NOTE_BY_ID(id, subId)).then(body),

  listHistory: (id)          => apiClient.get(E.HISTORY(id)).then(body),
};
