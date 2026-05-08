import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { unitService } from '../services/unit-service';

export function useUnitMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.catalog.units() });

  const createUnit = useMutation({
    mutationFn: unitService.create,
    onSuccess: invalidate,
  });

  const updateUnit = useMutation({
    mutationFn: ({ code, data }) => unitService.update(code, data),
    onSuccess: invalidate,
  });

  const deleteUnit = useMutation({
    mutationFn: unitService.remove,
    onSuccess: invalidate,
  });

  return { createUnit, updateUnit, deleteUnit };
}
