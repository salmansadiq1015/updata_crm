'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assetMaintenanceService } from '../services/asset-maintenance-service';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useAssetMaintenanceContext(installationId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.crm.assetMaintenance.context(installationId),
    queryFn: () => assetMaintenanceService.getContext(installationId),
    enabled: enabled && Boolean(installationId),
    staleTime: 30_000,
  });
}

export function useAssetMaintenanceMutations({ onBulkCreated, onScheduled } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidateAssetMaintenance = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.assetMaintenance.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.maintenance.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.installations.all() });
  };

  const bulkCreate = useMutation({
    mutationFn: (payload) => assetMaintenanceService.bulkCreateMaintenance(payload),
    onSuccess: (data) => {
      invalidateAssetMaintenance();
      showSuccess(
        t('crm.assetMaintenance.bulkCreated', 'Wartungseintraege verarbeitet: {count} erstellt')
          .replace('{count}', String(data?.created?.length || 0)),
      );
      onBulkCreated?.(data);
    },
    onError: showError,
  });

  const schedule = useMutation({
    mutationFn: (payload) => assetMaintenanceService.schedule(payload),
    onSuccess: (data) => {
      invalidateAssetMaintenance();
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.calendar.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.dashboard.all() });
      showSuccess(
        t('crm.assetMaintenance.scheduled', 'Wartung geplant: {count} Einsatz erstellt')
          .replace('{count}', String(data?.created?.length || 0)),
      );
      onScheduled?.(data);
    },
    onError: showError,
  });

  return { bulkCreate, schedule };
}
