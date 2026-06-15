import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { priceService } from '../services/price-service';

export function usePriceMutations() {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
    qc.invalidateQueries({ queryKey: ['catalog', 'prices'] });
    qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() });
  };

  const updatePrices = useMutation({
    mutationFn: priceService.update,
    onSuccess: invalidateAll,
  });

  const previewPrices = useMutation({
    mutationFn: priceService.preview,
  });

  const schedulePrices = useMutation({
    mutationFn: priceService.schedule,
    onSuccess: invalidateAll,
  });

  const rollbackBatch = useMutation({
    mutationFn: priceService.rollback,
    onSuccess: invalidateAll,
  });

  return { previewPrices, updatePrices, schedulePrices, rollbackBatch };
}
