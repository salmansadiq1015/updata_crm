'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { calendarService } from '../services/calendar-service';
import { useSchedulingStore } from '../stores/scheduling-store';

export function useCalendarQuery(queryParams) {
  const { filters } = useSchedulingStore();

  const params = {
    ...queryParams,
    ...(filters.teamId && { teamId: filters.teamId }),
    ...(filters.employeeIds?.length && { employeeIds: filters.employeeIds.join(',') }),
    ...(filters.assignmentType && { type: filters.assignmentType }),
    ...(filters.status && { status: filters.status }),
  };

  return useQuery({
    queryKey: queryKeys.deploy.calendar.data(params),
    queryFn: () => calendarService.getCalendar(params),
    staleTime: 15_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}
