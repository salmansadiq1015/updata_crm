'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '../services/vehicle-service';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export const vehicleKeys = {
  all: ['vehicles'],
  list: (params) => ['vehicles', 'list', params],
  stats: ['vehicles', 'stats'],
  detail: (id) => ['vehicles', 'detail', id],
  services: (id) => ['vehicles', id, 'services'],
  costs: (id, params) => ['vehicles', id, 'costs', params || {}],
  bookings: (id, params) => ['vehicles', id, 'bookings', params || {}],
  materials: (id) => ['vehicles', id, 'materials'],
  notes: (id) => ['vehicles', id, 'notes'],
  history: (id) => ['vehicles', id, 'history'],
};
const keys = vehicleKeys;

// Presigned photo URLs live for minutes, so lists stay fresh for 30 s and are
// kept while the next page loads (no skeleton flash between pages/filters).
export function useVehicles(params = {}) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => vehicleService.list(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useVehicleStats() {
  return useQuery({ queryKey: keys.stats, queryFn: vehicleService.stats, staleTime: 60_000 });
}

export function useVehicle(id) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => vehicleService.getById(id), enabled: !!id, staleTime: 15_000 });
}

export function useVehicleServices(id) {
  return useQuery({ queryKey: keys.services(id), queryFn: () => vehicleService.listServices(id), enabled: !!id });
}
export function useVehicleCosts(id, params) {
  return useQuery({ queryKey: keys.costs(id, params), queryFn: () => vehicleService.listCosts(id, params), enabled: !!id, placeholderData: keepPreviousData });
}
export function useVehicleBookings(id, params) {
  return useQuery({ queryKey: keys.bookings(id, params), queryFn: () => vehicleService.listBookings(id, params), enabled: !!id });
}
export function useVehicleMaterials(id) {
  return useQuery({ queryKey: keys.materials(id), queryFn: () => vehicleService.listMaterials(id), enabled: !!id });
}
export function useVehicleNotes(id) {
  return useQuery({ queryKey: keys.notes(id), queryFn: () => vehicleService.listNotes(id), enabled: !!id });
}
export function useVehicleHistory(id) {
  return useQuery({ queryKey: keys.history(id), queryFn: () => vehicleService.listHistory(id), enabled: !!id });
}

export function useVehicleMutations(id) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const ok = (msg) => () => { qc.invalidateQueries({ queryKey: keys.all }); if (msg) showSuccess(msg); };
  // Callers that render the error inline (forms) re-throw from mutateAsync; the toast is the fallback.
  const err = (e) => showError(e?.message || e);
  const saved = t('common.saved', 'Saved');
  const deleted = t('common.deleted', 'Deleted');

  return {
    create: useMutation({ mutationFn: vehicleService.create, onSuccess: ok(t('fleet.toast.created', 'Vehicle created')), onError: err }),
    update: useMutation({ mutationFn: ({ vehicleId, data }) => vehicleService.update(vehicleId, data), onSuccess: ok(saved), onError: err }),
    remove: useMutation({ mutationFn: (vehicleId) => vehicleService.remove(vehicleId), onSuccess: ok(deleted), onError: err }),
    assignDriver: useMutation({ mutationFn: ({ vehicleId, driverId }) => vehicleService.assignDriver(vehicleId, driverId), onSuccess: ok(t('fleet.toast.driverUpdated', 'Driver updated')), onError: err }),
    uploadPhoto: useMutation({ mutationFn: (file) => vehicleService.uploadPhoto(id, file), onSuccess: ok(t('fleet.toast.photoUpdated', 'Photo updated')), onError: err }),
    removePhoto: useMutation({ mutationFn: () => vehicleService.removePhoto(id), onSuccess: ok(t('fleet.toast.photoRemoved', 'Photo removed')), onError: err }),
    addService: useMutation({ mutationFn: (data) => vehicleService.addService(id, data), onSuccess: ok(saved), onError: err }),
    deleteService: useMutation({ mutationFn: (subId) => vehicleService.deleteService(id, subId), onSuccess: ok(deleted), onError: err }),
    addCost: useMutation({ mutationFn: (data) => vehicleService.addCost(id, data), onSuccess: ok(saved), onError: err }),
    deleteCost: useMutation({ mutationFn: (subId) => vehicleService.deleteCost(id, subId), onSuccess: ok(deleted), onError: err }),
    addBooking: useMutation({ mutationFn: (data) => vehicleService.addBooking(id, data), onSuccess: ok(t('fleet.toast.booked', 'Vehicle booked')), onError: err }),
    cancelBooking: useMutation({ mutationFn: (subId) => vehicleService.cancelBooking(id, subId), onSuccess: ok(t('fleet.toast.bookingCancelled', 'Booking cancelled')), onError: err }),
    addMaterial: useMutation({ mutationFn: (data) => vehicleService.addMaterial(id, data), onSuccess: ok(saved), onError: err }),
    deleteMaterial: useMutation({ mutationFn: (subId) => vehicleService.deleteMaterial(id, subId), onSuccess: ok(deleted), onError: err }),
    addNote: useMutation({ mutationFn: (data) => vehicleService.addNote(id, data), onSuccess: ok(saved), onError: err }),
    deleteNote: useMutation({ mutationFn: (subId) => vehicleService.deleteNote(id, subId), onSuccess: ok(deleted), onError: err }),
  };
}
