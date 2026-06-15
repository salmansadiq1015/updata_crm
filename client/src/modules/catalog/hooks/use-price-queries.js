import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { priceService } from '../services/price-service';

export function usePriceHistory(articleId) {
  return useQuery({
    queryKey: queryKeys.catalog.priceHistory(articleId),
    queryFn: () => priceService.getHistory(articleId).then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    enabled: !!articleId,
  });
}

export function usePriceBatches() {
  return useQuery({
    queryKey: queryKeys.catalog.priceBatches(),
    queryFn: () => priceService.getBatches().then((r) => ({
      data: Array.isArray(r) ? r : (r?.data ?? []),
      pagination: r?.pagination ?? null,
    })),
    staleTime: 30_000,
  });
}
