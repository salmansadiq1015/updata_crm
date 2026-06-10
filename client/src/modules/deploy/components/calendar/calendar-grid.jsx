'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CalendarRow } from './calendar-row';
import { CalendarTimeRuler } from './calendar-time-ruler';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_HEIGHT } from '../../constants/deploy-constants';
import { CalendarDays } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function CalendarGrid({
  employees,
  days,
  timeSlots,
  view,
  isLoading,
  canWrite,
  onAssignmentClick,
  onNewAssignment,
}) {
  const { t } = useLanguage();
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: employees.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  if (isLoading) {
    const colCount = view === 'day' ? 14 : 7;
    return (
      <div className="flex-1 flex flex-col overflow-hidden border rounded-lg bg-background">
        {/* Time ruler skeleton */}
        <div className="flex border-b bg-muted/30" style={{ paddingLeft: 220 }}>
          {Array.from({ length: colCount }, (_, i) => (
            <div key={i} className="flex-1 py-2 flex flex-col items-center gap-1 border-r last:border-r-0">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </div>
          ))}
        </div>
        {/* Employee row skeletons */}
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex border-b" style={{ height: ROW_HEIGHT }}>
            <div className="w-[220px] shrink-0 flex items-center gap-2 px-3 border-r">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex-1 relative px-1 py-1">
              <Skeleton
                className="absolute top-3 h-10 rounded-md"
                style={{ left: `${8 + i * 5}%`, width: `${14 + (i % 3) * 8}%` }}
              />
              {i % 2 === 0 && (
                <Skeleton
                  className="absolute top-3 h-10 rounded-md"
                  style={{ left: `${52 + i * 3}%`, width: `${10 + (i % 4) * 5}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <DeployEmptyState
          icon={CalendarDays}
          title={t('deploy.empty.calendarTitle', 'Noch keine Einsätze')}
          description={t('deploy.empty.calendarDesc', 'Erstellen Sie einen neuen Einsatz, um Ihren Kalender zu füllen.')}
          actionLabel={onNewAssignment ? t('deploy.assignments.create', 'Einsatz erstellen') : undefined}
          onAction={onNewAssignment}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden border rounded-lg bg-background">
      <CalendarTimeRuler view={view} days={days} timeSlots={timeSlots} />
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const employee = employees[virtualRow.index];
            return (
              <CalendarRow
                key={employee.employeeId}
                employee={employee}
                days={days}
                view={view}
                canWrite={canWrite}
                onAssignmentClick={onAssignmentClick}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
