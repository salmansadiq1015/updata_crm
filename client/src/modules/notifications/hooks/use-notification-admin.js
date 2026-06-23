import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { notificationAdminService } from '../services/notification-admin-service';

export function useNotificationHistory(filters) {
  return useQuery({
    queryKey: queryKeys.notifications.history(filters),
    queryFn: () => notificationAdminService.getHistory(filters),
  });
}

export function useNotificationMetrics(filters) {
  return useQuery({
    queryKey: queryKeys.notifications.metrics(filters),
    queryFn: () => notificationAdminService.getMetrics(filters),
    staleTime: 30_000,
  });
}

export function useNotificationTemplates(filters) {
  return useQuery({
    queryKey: queryKeys.notifications.templates(filters),
    queryFn: () => notificationAdminService.listTemplates(filters),
  });
}

export function useScheduledNotifications(filters) {
  return useQuery({
    queryKey: queryKeys.notifications.scheduled(filters),
    queryFn: () => notificationAdminService.listScheduled(filters),
  });
}

export function useNotificationAdminMutations() {
  const queryClient = useQueryClient();
  const invalidateAdmin = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'history'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'metrics'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'scheduled'] });
  };

  const exportHistory = useMutation({
    mutationFn: (filters) => notificationAdminService.exportHistory(filters),
  });

  const createTemplate = useMutation({
    mutationFn: (payload) => notificationAdminService.createTemplate(payload),
    onSuccess: invalidateAdmin,
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, payload }) => notificationAdminService.updateTemplate(id, payload),
    onSuccess: invalidateAdmin,
  });

  const previewTemplate = useMutation({
    mutationFn: ({ id, sampleData }) => notificationAdminService.previewTemplate(id, sampleData),
  });

  const removeTemplate = useMutation({
    mutationFn: (id) => notificationAdminService.removeTemplate(id),
    onSuccess: invalidateAdmin,
  });

  const createScheduled = useMutation({
    mutationFn: (payload) => notificationAdminService.createScheduled(payload),
    onSuccess: invalidateAdmin,
  });

  const cancelScheduled = useMutation({
    mutationFn: (id) => notificationAdminService.cancelScheduled(id),
    onSuccess: invalidateAdmin,
  });

  const pauseScheduled = useMutation({
    mutationFn: (id) => notificationAdminService.pauseScheduled(id),
    onSuccess: invalidateAdmin,
  });

  const resumeScheduled = useMutation({
    mutationFn: (id) => notificationAdminService.resumeScheduled(id),
    onSuccess: invalidateAdmin,
  });

  const anonymizeHistory = useMutation({
    mutationFn: (payload) => notificationAdminService.anonymizeHistory(payload),
    onSuccess: invalidateAdmin,
  });

  const flagStaleDeliveries = useMutation({
    mutationFn: (payload) => notificationAdminService.flagStaleDeliveries(payload),
    onSuccess: invalidateAdmin,
  });

  return {
    exportHistory,
    createTemplate,
    updateTemplate,
    previewTemplate,
    removeTemplate,
    createScheduled,
    cancelScheduled,
    pauseScheduled,
    resumeScheduled,
    anonymizeHistory,
    flagStaleDeliveries,
  };
}
