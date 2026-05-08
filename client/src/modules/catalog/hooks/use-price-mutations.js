import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { priceService } from '../services/price-service';

export function usePriceMutations() {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
    qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() });
  };

  const updatePrices = useMutation({
    mutationFn: priceService.update,
    onSuccess: invalidateAll,
  });

  const schedulePrices = useMutation({
    mutationFn: priceService.schedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() }),
  });

  const rollbackBatch = useMutation({
    mutationFn: priceService.rollback,
    onSuccess: invalidateAll,
  });

  return { updatePrices, schedulePrices, rollbackBatch };
}
