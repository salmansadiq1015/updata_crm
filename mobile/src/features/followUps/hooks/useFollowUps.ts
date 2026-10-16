import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';

import { followUpsApi } from '../api/followUpsApi';
import type { FollowUpScope } from '../types';

export function useFollowUps(scope: FollowUpScope = 'mine') {
  return useQuery({
    queryKey: queryKeys.followUps.list(scope),
    queryFn: ({ signal }) => followUpsApi.list(scope, signal),
  });
}
