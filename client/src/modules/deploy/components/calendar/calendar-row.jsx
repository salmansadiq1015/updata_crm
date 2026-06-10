'use client';

import { memo, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import {
  CALENDAR_VIEWS, DAY_START_HOUR, DAY_END_HOUR,
  AVAILABILITY_TYPE_META, ROW_HEIGHT,
} from '../../constants/deploy-constants';
import { EmployeeAvatarRow } from '../shared/employee-avatar-row';
import { CalendarAssignmentBlock } from './calendar-assignment-block';
import { CalendarPmScheduleBlock } from './calendar-pm-schedule-block';
import { CalendarAvailabilityBar } from './calendar-availability-bar';
import { useSchedulingStore } from '../../stores/scheduling-store';
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

/**
 * Position a PM schedule entry (full-day, date-based) across the day columns.
 * PM entries have no time-of-day, so they span whole days. Returns null when
 * the entry does not intersect the visible days.
 */
function computePmBlockStyle(entry, days) {
  const start = startOfDay(new Date(entry.startDatetime));
  const end = startOfDay(new Date(entry.endDatetime || entry.startDatetime));
  const dayWidth = 100 / days.length;

  // First and last visible day index the entry covers (clamped to range).
  let startIdx = -1;
  let endIdx = -1;
  days.forEach((d, i) => {
    const day = startOfDay(d);
    if (day >= start && day <= end) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  });
  if (startIdx === -1) return null;

  const span = endIdx - startIdx + 1;
  return {
    left: `${startIdx * dayWidth}%`,
    width: `${Math.max(dayWidth * 0.6, span * dayWidth)}%`,
    height: 18,
    // Pin PM band to the bottom of the row, below assignment blocks.
    bottom: 2,
  };
}

function buildSlotStart(day, hour) {
  const start = new Date(day);
  start.setHours(hour, 0, 0, 0);
  return start;
}

function CalendarDropSlot({ employeeId, day, hour, className, onClick }) {
  const start = buildSlotStart(day, hour);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  const conflictPreview = useSchedulingStore((state) => state.conflictPreview);
  const hasHardConflict = conflictPreview?.conflicts?.some((conflict) => conflict.severity === 'HARD');
  const hasSoftConflict = conflictPreview?.conflicts?.some((conflict) => conflict.severity === 'SOFT');
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-drop-${employeeId}-${start.toISOString()}`,
    data: {
      employeeId,
      startDatetime: start.toISOString(),
    },
  });

  return (
    <div
      ref={setNodeRef}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.({
        employeeId,
        startDatetime: start.toISOString(),
        endDatetime: end.toISOString(),
      })}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick({
          employeeId,
          startDatetime: start.toISOString(),
          endDatetime: end.toISOString(),
        });
      }}
      className={cn(
        'h-full min-w-0 transition-colors',
        onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
        isOver && !hasHardConflict && !hasSoftConflict && 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/60',
        isOver && hasSoftConflict && !hasHardConflict && 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/70',
        isOver && hasHardConflict && 'bg-red-500/15 ring-1 ring-inset ring-red-500/70',
        className
      )}
    />
  );
}

export const CalendarRow = memo(function CalendarRow({
  employee,
  days,
  view,
  canWrite,
  onAssignmentClick,
  onResizeStart,
  onSlotClick,
  style,
}) {
  const assignments = employee.assignments || [];
  const availability = useMemo(() => employee.availability || [], [employee.availability]);
  const pmScheduleEntries = employee.pmScheduleEntries || [];

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
      <div className="flex-1 flex relative" data-calendar-row-grid="true">
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
              {canWrite && view === CALENDAR_VIEWS.MONTH && (
                <CalendarDropSlot
                  employeeId={employee.employeeId}
                  day={day}
                  hour={DAY_START_HOUR}
                  className="absolute inset-0 z-0"
                  onClick={onSlotClick}
                />
              )}
              {canWrite && view !== CALENDAR_VIEWS.MONTH && (
                <div className="absolute inset-0 z-0 flex">
                  {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => (
                    <CalendarDropSlot
                      key={`${dayKey}-${i}`}
                      employeeId={employee.employeeId}
                      day={day}
                      hour={DAY_START_HOUR + i}
                      className="flex-1 border-r border-transparent last:border-r-0"
                      onClick={onSlotClick}
                    />
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
              canDrag={canWrite}
              onClick={onAssignmentClick}
              onResizeStart={canWrite ? onResizeStart : undefined}
            />
          );
        })}

        {/* Read-only PM schedule entries (project work) as a bottom band */}
        {pmScheduleEntries.map((entry) => {
          const blockStyle = computePmBlockStyle(entry, days);
          if (!blockStyle) return null;
          return (
            <CalendarPmScheduleBlock
              key={`pm-${entry._id}`}
              entry={entry}
              style={blockStyle}
            />
          );
        })}
      </div>
    </div>
  );
});
