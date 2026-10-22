import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/constants/queryKeys';

import { linkAssistantApi } from './api';
import { groupReminders } from './domain';

/** Reminder SMS due for link conversations the lead has not finished (empty when none or offline). */
export function useLinkReminders() {
  const due = useQuery({
    queryKey: queryKeys.linkAssistant.remindersDue,
    queryFn: ({ signal }) => linkAssistantApi.remindersDue(signal),
    staleTime: 60_000,
  });
  return useMemo(() => groupReminders(due.data ?? []), [due.data]);
}
