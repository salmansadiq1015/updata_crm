'use client';

import { memo, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ASSIGNMENT_TYPE_META, PRIORITY_META } from '../../constants/deploy-constants';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AssignmentTypeBadge } from '../shared/assignment-type-badge';
import { AssignmentStatusBadge } from '../shared/assignment-status-badge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { MapPin, Clock } from 'lucide-react';

export const CalendarAssignmentBlock = memo(function CalendarAssignmentBlock({
  assignment,
  style,
  onClick,
  onResizeStart,
  className,
}) {
  const typeMeta = ASSIGNMENT_TYPE_META[assignment.assignmentType] || ASSIGNMENT_TYPE_META.OTHER;
  const priorityMeta = PRIORITY_META[assignment.priority];
  const isUrgent = assignment.priority === 'URGENT';
  const isHigh = assignment.priority === 'HIGH';

  const bgColor = assignment.colorCode || typeMeta.calendarColor;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => onClick?.(assignment)}
          className={cn(
            'absolute rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium cursor-pointer',
            'text-white overflow-hidden whitespace-nowrap text-ellipsis text-left',
            'hover:brightness-110 hover:shadow-md transition-all duration-150',
            'border-l-[3px]',
            isUrgent && 'ring-1 ring-red-400 animate-pulse',
            isHigh && 'ring-1 ring-amber-400',
            className
          )}
          style={{
            ...style,
            backgroundColor: `${bgColor}cc`,
            borderLeftColor: bgColor,
          }}
        >
          <div className="truncate">
            {assignment.title || typeMeta.label}
          </div>
          {style?.height > 28 && (
            <div className="truncate text-white/80 text-[9px]">
              {format(new Date(assignment.startDatetime), 'HH:mm')} – {format(new Date(assignment.endDatetime), 'HH:mm')}
            </div>
          )}
          {onResizeStart && (
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-r-md"
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(assignment, e);
              }}
            />
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm truncate">
              {assignment.title || typeMeta.label}
            </span>
            {priorityMeta?.icon && (
              <priorityMeta.icon className={cn('h-4 w-4 shrink-0', priorityMeta.color)} />
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <AssignmentTypeBadge type={assignment.assignmentType} />
            <AssignmentStatusBadge status={assignment.status} />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {format(new Date(assignment.startDatetime), 'EEE d. MMM, HH:mm', { locale: de })} – {format(new Date(assignment.endDatetime), 'HH:mm')}
            </div>
            {assignment.assignmentNumber && (
              <div className="text-muted-foreground/70">
                #{assignment.assignmentNumber}
              </div>
            )}
          </div>

          {assignment.instructions && (
            <p className="text-xs text-muted-foreground line-clamp-2 border-t pt-1.5">
              {assignment.instructions}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
