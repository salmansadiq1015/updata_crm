import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ciService } from '../services/CIService';

export const useCIConfig = () => useQuery({
  queryKey: queryKeys.doctpl.ci.config(),
  queryFn: ciService.getConfig,
  select: (r) => r?.data,
});

export const useCIAssets = () => useQuery({
  queryKey: queryKeys.doctpl.ci.assets(),
  queryFn: ciService.listAssets,
  select: (r) => r?.data ?? [],
});

export const useCIAudit = () => useQuery({
  queryKey: queryKeys.doctpl.ci.audit(),
  queryFn: ciService.getAudit,
  select: (r) => r?.data,
});
