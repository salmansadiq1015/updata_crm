'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sparePartService } from '../services/spare-part-service';

const keys = {
  byInstallation: (installationId) => ['mobile', 'installation-spare-parts', installationId],
  search: (term) => ['mobile', 'spare-part-search', term],
};

export function useInstallationSpareParts(installationId) {
  return useQuery({
    queryKey: keys.byInstallation(installationId),
    queryFn: () => sparePartService.getByInstallation(installationId),
    enabled: Boolean(installationId),
    staleTime: 60_000,
  });
}

export function useSparePartSearch(term) {
  const normalized = term.trim();
  return useQuery({
    queryKey: keys.search(normalized),
    queryFn: () => sparePartService.search(normalized),
    enabled: normalized.length >= 2,
    staleTime: 60_000,
  });
}

export function useSparePartMutations(installationId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.byInstallation(installationId) });

  const linkPart = useMutation({
    mutationFn: (payload) => sparePartService.linkToInstallation(installationId, payload),
    onSuccess: invalidate,
  });

  const flagForOrdering = useMutation({
    mutationFn: ({ sparePartId, ...payload }) =>
      sparePartService.flagForOrdering(installationId, sparePartId, payload),
    onSuccess: invalidate,
  });

  return { linkPart, flagForOrdering };
}
