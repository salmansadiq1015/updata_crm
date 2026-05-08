import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { unitService } from '../services/unit-service';

export function useUnits() {
  return useQuery({
    queryKey: queryKeys.catalog.units(),
    queryFn: () => unitService.list().then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    staleTime: 5 * 60_000,
  });
}
