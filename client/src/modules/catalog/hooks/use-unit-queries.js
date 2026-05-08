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

export function useUnitDetail(code) {
  return useQuery({
    queryKey: queryKeys.catalog.unitDetail(code),
    queryFn: () => unitService.getByCode(code).then((r) => r.data ?? r),
    enabled: !!code,
  });
}
