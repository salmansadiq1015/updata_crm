'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '../services/vehicle-service';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

const keys = {
  all: ['vehicles'],
  list: (params) => ['vehicles', 'list', params],
  detail: (id) => ['vehicles', 'detail', id],
  services: (id) => ['vehicles', id, 'services'],
  materials: (id) => ['vehicles', id, 'materials'],
  notes: (id) => ['vehicles', id, 'notes'],
  history: (id) => ['vehicles', id, 'history'],
};

export function useVehicles(params = {}) {
  return useQuery({ queryKey: keys.list(params), queryFn: () => vehicleService.list(params) });
}

export function useVehicle(id) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => vehicleService.getById(id), enabled: !!id });
}

export function useVehicleServices(id) {
  return useQuery({ queryKey: keys.services(id), queryFn: () => vehicleService.listServices(id), enabled: !!id });
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
  const ok = (msg) => () => { qc.invalidateQueries({ queryKey: keys.all }); showSuccess(msg); };
  const err = (e) => showError(e?.message || e);

  return {
    create: useMutation({ mutationFn: vehicleService.create, onSuccess: ok(t('vehicles.created', 'Fahrzeug erstellt')), onError: err }),
    update: useMutation({ mutationFn: ({ vehicleId, data }) => vehicleService.update(vehicleId, data), onSuccess: ok(t('common.saved', 'Gespeichert')), onError: err }),
    remove: useMutation({ mutationFn: (vehicleId) => vehicleService.remove(vehicleId), onSuccess: ok(t('common.deleted', 'Gelöscht')), onError: err }),
    assignDriver: useMutation({ mutationFn: ({ vehicleId, driverId }) => vehicleService.assignDriver(vehicleId, driverId), onSuccess: ok(t('vehicles.driverUpdated', 'Fahrer aktualisiert')), onError: err }),
    addService: useMutation({ mutationFn: (data) => vehicleService.addService(id, data), onSuccess: ok(t('common.saved', 'Gespeichert')), onError: err }),
    deleteService: useMutation({ mutationFn: (subId) => vehicleService.deleteService(id, subId), onSuccess: ok(t('common.deleted', 'Gelöscht')), onError: err }),
    addMaterial: useMutation({ mutationFn: (data) => vehicleService.addMaterial(id, data), onSuccess: ok(t('common.saved', 'Gespeichert')), onError: err }),
    deleteMaterial: useMutation({ mutationFn: (subId) => vehicleService.deleteMaterial(id, subId), onSuccess: ok(t('common.deleted', 'Gelöscht')), onError: err }),
    addNote: useMutation({ mutationFn: (data) => vehicleService.addNote(id, data), onSuccess: ok(t('common.saved', 'Gespeichert')), onError: err }),
    deleteNote: useMutation({ mutationFn: (subId) => vehicleService.deleteNote(id, subId), onSuccess: ok(t('common.deleted', 'Gelöscht')), onError: err }),
  };
}

export const VEHICLE_STATUS_META = {
  available: { labelKey: 'vehicles.status.available', label: 'Verfügbar', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/20' },
  in_use: { labelKey: 'vehicles.status.in_use', label: 'Im Einsatz', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-400/20' },
  workshop: { labelKey: 'vehicles.status.workshop', label: 'Werkstatt', cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-400/20' },
};
