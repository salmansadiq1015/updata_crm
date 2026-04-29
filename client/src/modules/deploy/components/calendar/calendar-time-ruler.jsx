'use client';

import { format, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CALENDAR_VIEWS, DAY_START_HOUR, DAY_END_HOUR, SIDEBAR_WIDTH } from '../../constants/deploy-constants';

export function CalendarTimeRuler({ view, days, timeSlots }) {
  if (view === CALENDAR_VIEWS.MONTH) {
    return (
      <div className="flex border-b bg-muted/30 sticky top-0 z-20" style={{ paddingLeft: SIDEBAR_WIDTH }}>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'flex-1 text-center py-2 text-xs font-medium border-r last:border-r-0',
              isToday(day) && 'bg-primary/5 text-primary font-semibold'
            )}
          >
            <div>{format(day, 'EEE', { locale: de })}</div>
            <div className={cn('text-lg', isToday(day) ? 'text-primary' : 'text-foreground')}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (view === CALENDAR_VIEWS.DAY) {
    return (
      <div className="flex border-b bg-muted/30 sticky top-0 z-20" style={{ paddingLeft: SIDEBAR_WIDTH }}>
        {timeSlots.map((slot) => (
          <div
            key={slot.label}
            className={cn(
              'text-center py-1 text-[10px] text-muted-foreground border-r last:border-r-0',
              slot.minute === 0 ? 'font-medium' : 'opacity-50'
            )}
            style={{ width: `${100 / timeSlots.length}%` }}
          >
            {slot.minute === 0 ? slot.label : ''}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex border-b bg-muted/30 sticky top-0 z-20" style={{ paddingLeft: SIDEBAR_WIDTH }}>
      {days.map((day) => (
        <div key={day.toISOString()} className="flex-1 border-r last:border-r-0">
          <div
            className={cn(
              'text-center py-1.5',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <div className="text-[10px] text-muted-foreground font-medium uppercase">
              {format(day, 'EEE', { locale: de })}
            </div>
            <div className={cn(
              'text-sm font-medium',
              isToday(day)
                ? 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto'
                : 'text-foreground'
            )}>
              {format(day, 'd')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
