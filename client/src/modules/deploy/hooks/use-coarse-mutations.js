'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coarseService } from '../services/coarse-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useCoarseMatrix(params) {
  return useQuery({
    queryKey: queryKeys.deploy.coarse.matrix(params),
    queryFn: () => coarseService.getMatrix(params),
    staleTime: 60_000,
    enabled: !!params.year && !!params.weekFrom && !!params.weekTo,
  });
}

export function useCoarseMutations({ onCreate, onUpdate, onDelete, onBulk } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.deploy.coarse.all() });
  };

  const create = useMutation({
    mutationFn: (data) => coarseService.createAllocation(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('deploy.coarse.created', 'Zuteilung erstellt'));
      onCreate?.(res);
    },
    onError: (err) => showError(err),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => coarseService.updateAllocation(id, data),
    onSuccess: (res) => {
      invalidate();
      onUpdate?.(res);
    },
    onError: (err) => showError(err),
  });

  const remove = useMutation({
    mutationFn: (id) => coarseService.deleteAllocation(id),
    onSuccess: () => {
      invalidate();
      onDelete?.();
    },
    onError: (err) => showError(err),
  });

  const bulkUpsert = useMutation({
    mutationFn: (data) => coarseService.bulkUpsert(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('deploy.coarse.updated', 'Zuteilungen aktualisiert'));
      onBulk?.(res);
    },
    onError: (err) => showError(err),
  });

  return { create, update, remove, bulkUpsert };
}
