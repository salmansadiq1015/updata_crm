'use client';

import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  CALENDAR_VIEWS, DAY_START_HOUR, DAY_END_HOUR,
  AVAILABILITY_TYPE_META, ROW_HEIGHT,
} from '../../constants/deploy-constants';
import { EmployeeAvatarRow } from '../shared/employee-avatar-row';
import { CalendarAssignmentBlock } from './calendar-assignment-block';
import { CalendarAvailabilityBar } from './calendar-availability-bar';
import {
  differenceInMinutes, startOfDay, isSameDay, isWithinInterval,
} from 'date-fns';

function computeBlockStyle(assignment, days, view) {
  const start = new Date(assignment.startDatetime);
  const end = new Date(assignment.endDatetime);
  const totalMinutesPerDay = (DAY_END_HOUR - DAY_START_HOUR) * 60;

  if (view === CALENDAR_VIEWS.MONTH) {
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex < 0) return null;
    const daySpan = Math.max(1, days.filter((d) =>
      isWithinInterval(d, { start: startOfDay(start), end: startOfDay(end) })
    ).length);
    return {
      left: `${(dayIndex / days.length) * 100}%`,
      width: `${(daySpan / days.length) * 100}%`,
      height: 20,
      top: 2,
    };
  }

  if (view === CALENDAR_VIEWS.DAY) {
    const dayStart = new Date(days[0]);
    dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const offsetMin = Math.max(0, differenceInMinutes(start, dayStart));
    const durationMin = differenceInMinutes(end, start);
    return {
      left: `${(offsetMin / totalMinutesPerDay) * 100}%`,
      width: `${Math.max(1.5, (durationMin / totalMinutesPerDay) * 100)}%`,
      top: 2,
      height: ROW_HEIGHT - 28,
    };
  }

  // Week view
  const dayIndex = days.findIndex((d) => isSameDay(d, start));
  if (dayIndex < 0) return null;
  const dayStart = new Date(days[dayIndex]);
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const offsetMin = Math.max(0, differenceInMinutes(start, dayStart));
  const durationMin = differenceInMinutes(end, start);
  const dayWidthPercent = 100 / days.length;
  const leftWithinDay = (offsetMin / totalMinutesPerDay) * dayWidthPercent;
  const widthPercent = Math.max(0.8, (durationMin / totalMinutesPerDay) * dayWidthPercent);

  return {
    left: `${dayIndex * dayWidthPercent + leftWithinDay}%`,
    width: `${widthPercent}%`,
    top: 2,
    height: ROW_HEIGHT - 28,
  };
}

export const CalendarRow = memo(function CalendarRow({
  employee,
  days,
  view,
  onAssignmentClick,
  style,
}) {
  const assignments = employee.assignments || [];
  const availability = employee.availability || [];

  const availabilityMap = useMemo(() => {
    const map = {};
    availability.forEach((a) => {
      const key = new Date(a.date).toDateString();
      map[key] = a;
    });
    return map;
  }, [availability]);

  return (
    <div
      className="flex border-b hover:bg-muted/20 transition-colors relative"
      style={{ ...style, height: ROW_HEIGHT }}
    >
      {/* Frozen sidebar column */}
      <div className="w-[220px] shrink-0 flex items-center px-3 border-r bg-background sticky left-0 z-10">
        <EmployeeAvatarRow name={employee.employeeName} />
      </div>

      {/* Calendar cells - one per day */}
      <div className="flex-1 flex relative">
        {days.map((day) => {
          const dayKey = day.toDateString();
          const avail = availabilityMap[dayKey];
          const isUnavailable = avail && avail.availabilityType !== 'WORKING';
          const availMeta = avail ? AVAILABILITY_TYPE_META[avail.availabilityType] : null;

          return (
            <div
              key={dayKey}
              className={cn(
                'flex-1 border-r last:border-r-0 relative',
                isUnavailable && (availMeta?.color || 'bg-gray-100 dark:bg-gray-800/50'),
                isUnavailable && 'opacity-60'
              )}
            >
              {avail && <CalendarAvailabilityBar availability={avail} />}
              {/* Hour grid lines (week/day view) */}
              {view !== CALENDAR_VIEWS.MONTH && (
                <div className="absolute inset-0 flex pointer-events-none">
                  {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => (
                    <div key={i} className="flex-1 border-r border-dashed border-muted-foreground/10" />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Assignment blocks positioned absolutely over the grid */}
        {assignments.map((assignment) => {
          const blockStyle = computeBlockStyle(assignment, days, view);
          if (!blockStyle) return null;
          return (
            <CalendarAssignmentBlock
              key={assignment._id}
              assignment={assignment}
              style={blockStyle}
              onClick={onAssignmentClick}
            />
          );
        })}
      </div>
    </div>
  );
});
