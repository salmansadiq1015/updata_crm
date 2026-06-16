'use client';

import { useMemo, useCallback } from 'react';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays, addWeeks, addMonths,
  subDays, subWeeks, subMonths, format, eachDayOfInterval,
  differenceInMinutes, getHours, getMinutes, getISOWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { useSchedulingStore } from '../stores/scheduling-store';
import { CALENDAR_VIEWS, DAY_START_HOUR, DAY_END_HOUR, SLOT_DURATION_MINUTES } from '../constants/deploy-constants';

export function useCalendarNavigation() {
  const { view, currentDate: currentDateISO, setView, setCurrentDate } = useSchedulingStore();
  const currentDate = useMemo(() => new Date(currentDateISO), [currentDateISO]);

  const dateRange = useMemo(() => {
    switch (view) {
      case CALENDAR_VIEWS.DAY:
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
      case CALENDAR_VIEWS.WEEK:
        return {
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 }),
        };
      case CALENDAR_VIEWS.MONTH:
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
      default:
        return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    }
  }, [view, currentDate]);

  const days = useMemo(
    () => eachDayOfInterval({ start: dateRange.start, end: dateRange.end }),
    [dateRange]
  );

  const timeSlots = useMemo(() => {
    if (view === CALENDAR_VIEWS.MONTH) return [];
    const slots = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
      for (let m = 0; m < 60; m += SLOT_DURATION_MINUTES) {
        slots.push({ hour: h, minute: m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
      }
    }
    return slots;
  }, [view]);

  const title = useMemo(() => {
    switch (view) {
      case CALENDAR_VIEWS.DAY:
        return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
      case CALENDAR_VIEWS.WEEK: {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        const kw = getISOWeek(weekStart);
        return `KW ${kw} · ${format(weekStart, 'd. MMM', { locale: de })} – ${format(weekEnd, 'd. MMM yyyy', { locale: de })}`;
      }
      case CALENDAR_VIEWS.MONTH:
        return format(currentDate, 'MMMM yyyy', { locale: de });
      default:
        return '';
    }
  }, [view, currentDate]);

  const goToday = useCallback(() => setCurrentDate(new Date()), [setCurrentDate]);

  const goNext = useCallback(() => {
    switch (view) {
      case CALENDAR_VIEWS.DAY: setCurrentDate(addDays(currentDate, 1)); break;
      case CALENDAR_VIEWS.WEEK: setCurrentDate(addWeeks(currentDate, 1)); break;
      case CALENDAR_VIEWS.MONTH: setCurrentDate(addMonths(currentDate, 1)); break;
    }
  }, [view, currentDate, setCurrentDate]);

  const goPrev = useCallback(() => {
    switch (view) {
      case CALENDAR_VIEWS.DAY: setCurrentDate(subDays(currentDate, 1)); break;
      case CALENDAR_VIEWS.WEEK: setCurrentDate(subWeeks(currentDate, 1)); break;
      case CALENDAR_VIEWS.MONTH: setCurrentDate(subMonths(currentDate, 1)); break;
    }
  }, [view, currentDate, setCurrentDate]);

  const queryParams = useMemo(() => ({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
  }), [dateRange]);

  return {
    view, setView, currentDate, dateRange, days, timeSlots, title,
    goToday, goNext, goPrev, queryParams,
  };
}

export function getSlotPosition(datetime, dayIndex, dayCount) {
  const date = new Date(datetime);
  const hours = getHours(date);
  const minutes = getMinutes(date);
  const totalMinutes = (hours - DAY_START_HOUR) * 60 + minutes;
  const totalSlots = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  return Math.max(0, Math.min(1, totalMinutes / totalSlots));
}

export function getBlockSpan(startDatetime, endDatetime) {
  return differenceInMinutes(new Date(endDatetime), new Date(startDatetime));
}
