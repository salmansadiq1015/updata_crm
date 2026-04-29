'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays, subDays, addWeeks, subWeeks, addMonths, subMonths,
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from 'date-fns';
import { queryKeys } from '@/lib/query/keys';
import { calendarService } from '../services/calendar-service';
import { CALENDAR_VIEWS } from '../constants/deploy-constants';

function getAdjacentRanges(view, currentDate) {
  const date = new Date(currentDate);
  const ranges = [];

  switch (view) {
    case CALENDAR_VIEWS.DAY: {
      const prev = subDays(date, 1);
      const next = addDays(date, 1);
      ranges.push(
        { startDate: startOfDay(prev).toISOString(), endDate: endOfDay(prev).toISOString() },
        { startDate: startOfDay(next).toISOString(), endDate: endOfDay(next).toISOString() },
      );
      break;
    }
    case CALENDAR_VIEWS.WEEK: {
      const prev = subWeeks(date, 1);
      const next = addWeeks(date, 1);
      ranges.push(
        { startDate: startOfWeek(prev, { weekStartsOn: 1 }).toISOString(), endDate: endOfWeek(prev, { weekStartsOn: 1 }).toISOString() },
        { startDate: startOfWeek(next, { weekStartsOn: 1 }).toISOString(), endDate: endOfWeek(next, { weekStartsOn: 1 }).toISOString() },
      );
      break;
    }
    case CALENDAR_VIEWS.MONTH: {
      const prev = subMonths(date, 1);
      const next = addMonths(date, 1);
      ranges.push(
        { startDate: startOfMonth(prev).toISOString(), endDate: endOfMonth(prev).toISOString() },
        { startDate: startOfMonth(next).toISOString(), endDate: endOfMonth(next).toISOString() },
      );
      break;
    }
  }

  return ranges;
}

export function usePrefetchAdjacentRanges(view, currentDate) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ranges = getAdjacentRanges(view, currentDate);
    ranges.forEach((params) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.deploy.calendar.data(params),
        queryFn: () => calendarService.getCalendar(params),
        staleTime: 60_000,
      });
    });
  }, [view, currentDate, queryClient]);
}
