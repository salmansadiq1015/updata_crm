import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { integrationService } from '@/modules/integrations/services/integration-service';
import {
  normalizeIntegrationListResponse,
  normalizeSyncHistoryResponse,
} from '@/modules/integrations/utils/integration-dashboard-utils';

export function useIntegrationDashboard(options = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.dashboard(),
    queryFn: () => integrationService.dashboard(),
    select: normalizeIntegrationListResponse,
    staleTime: 30_000,
    ...options,
  });
}

export function useIntegrationDetail(integrationKey, options = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.detail(integrationKey),
    queryFn: () => integrationService.getByKey(integrationKey),
    select: (response) => response?.data ?? null,
    enabled: Boolean(integrationKey) && (options.enabled ?? true),
    staleTime: 30_000,
    ...options,
  });
}

export function useIntegrationHealthHistory(integrationKey, period = '24h', options = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.healthHistory(integrationKey, period),
    queryFn: () => integrationService.healthHistory(integrationKey, { period }),
    select: normalizeIntegrationListResponse,
    enabled: Boolean(integrationKey) && (options.enabled ?? true),
    staleTime: 30_000,
    ...options,
  });
}

export function useIntegrationSyncHistory(integrationKey, params = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.syncHistory(integrationKey, params),
    queryFn: () => integrationService.syncHistory(integrationKey, params),
    select: normalizeSyncHistoryResponse,
    enabled: Boolean(integrationKey) && (options.enabled ?? true),
    staleTime: 30_000,
    ...options,
  });
}

export function useIntegrationAdminMutations(t) {
  const queryClient = useQueryClient();

  const invalidate = async (integrationKey) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all() }),
      integrationKey
        ? queryClient.invalidateQueries({ queryKey: queryKeys.integrations.detail(integrationKey) })
        : Promise.resolve(),
    ]);
  };

  const enable = useMutation({
    mutationFn: (integrationKey) => integrationService.enable(integrationKey),
    onSuccess: async (_, integrationKey) => {
      await invalidate(integrationKey);
      showSuccess(t('integrations.admin.toast.enabled'));
    },
    onError: showError,
  });

  const disable = useMutation({
    mutationFn: (integrationKey) => integrationService.disable(integrationKey),
    onSuccess: async (_, integrationKey) => {
      await invalidate(integrationKey);
      showSuccess(t('integrations.admin.toast.disabled'));
    },
    onError: showError,
  });

  const healthCheck = useMutation({
    mutationFn: (integrationKey) => integrationService.healthCheck(integrationKey),
    onSuccess: async (_, integrationKey) => {
      await invalidate(integrationKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.integrations.healthHistory(integrationKey, '24h') });
      showSuccess(t('integrations.admin.toast.healthChecked'));
    },
    onError: showError,
  });

  return {
    enable,
    disable,
    healthCheck,
    isBusy: enable.isPending || disable.isPending || healthCheck.isPending,
  };
}
