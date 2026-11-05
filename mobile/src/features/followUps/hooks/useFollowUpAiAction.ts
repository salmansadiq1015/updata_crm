import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import { showApiErrorToast } from '@/utils/toast';

import { followUpsApi } from '../api/followUpsApi';

export type FollowUpAiAction = 'call-now' | 'pause' | 'resume';

/** Call now / pause / resume an AI follow-up; refreshes the agenda so web and app stay in sync. */
export function useFollowUpAiAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ followUpId, action }: { followUpId: string; action: FollowUpAiAction }) => followUpsApi.aiAction(followUpId, action),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.followUps.all }),
    onError: (error) => showApiErrorToast(error),
  });
}
