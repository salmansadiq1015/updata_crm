'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { numberingService } from '@/modules/qop/services/numbering-service';

function normalizeListResponse(response) {
  return Array.isArray(response?.data) ? response.data : [];
}

export function useNumberingSequences(t) {
  const queryClient = useQueryClient();
  const listKey = queryKeys.qop.numberSequences();

  const sequencesQuery = useQuery({
    queryKey: listKey,
    queryFn: numberingService.list,
    select: normalizeListResponse,
  });

  const updateSequence = useMutation({
    mutationFn: ({ id, data }) => numberingService.update(id, data),
    onSuccess: async () => {
      showSuccess(t('numbering.toast.saved', 'Number sequence saved.'));
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error) => showError(error),
  });

  return {
    ...sequencesQuery,
    sequences: sequencesQuery.data || [],
    updateSequence,
  };
}
