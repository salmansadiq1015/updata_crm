import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { textBlockService } from '../services/text-block-service';

export function useTextBlocks(filters = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.textBlocks(filters),
    queryFn: () => textBlockService.list(filters).then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    staleTime: 60_000,
  });
}
