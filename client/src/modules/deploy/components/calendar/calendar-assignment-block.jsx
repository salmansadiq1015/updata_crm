'use client';

import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ASSIGNMENT_TYPE_META, PRIORITY_META, translateMetaLabel } from '../../constants/deploy-constants';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AssignmentTypeBadge } from '../shared/assignment-type-badge';
import { AssignmentStatusBadge } from '../shared/assignment-status-badge';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Clock, Hash, MapPin, User } from 'lucide-react';

function formatAddress(site) {
  if (!site) return '';
  const cityLine = [site.postalCode, site.city].filter(Boolean).join(' ');
  return [site.name, site.street, cityLine].filter(Boolean).join(', ');
}

function DetailLine({ icon: Icon, children }) {
  if (!children) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export const CalendarAssignmentBlock = memo(function CalendarAssignmentBlock({
  assignment,
  style,
  canDrag,
  onClick,
  onResizeStart,
  className,
}) {
  const { t } = useLanguage();
  const typeMeta = ASSIGNMENT_TYPE_META[assignment.assignmentType] || ASSIGNMENT_TYPE_META.OTHER;
  const priorityMeta = PRIORITY_META[assignment.priority];
  const typeLabel = translateMetaLabel(t, typeMeta);
  const isUrgent = assignment.priority === 'URGENT';
  const isHigh = assignment.priority === 'HIGH';
  const customerName = assignment.customerId?.name || assignment.projectId?.customerName || '';
  const siteAddress = formatAddress(assignment.siteId || assignment.projectId?.siteId);
  const timeLabel = `${format(new Date(assignment.startDatetime), 'HH:mm')} - ${format(new Date(assignment.endDatetime), 'HH:mm')}`;
  const shortTimeLabel = `${format(new Date(assignment.startDatetime), 'HH:mm')}–${format(new Date(assignment.endDatetime), 'HH:mm')}`;

  const site = assignment.siteId || assignment.projectId?.siteId;
  const shortAddress = site ? [site.street, site.city].filter(Boolean).join(', ') : '';

  const employee = assignment.employeeId;
  const employeeInitials = employee?.firstName && employee?.lastName
    ? `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase()
    : '';

  const bgColor = assignment.colorCode || typeMeta.calendarColor;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `assignment-${assignment._id}`,
    data: { assignment },
    disabled: !canDrag,
  });

  const transformStyle = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onClick?.(assignment)}
          className={cn(
            'absolute rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium cursor-pointer',
            'text-white overflow-hidden whitespace-nowrap text-ellipsis text-left',
            'hover:brightness-110 hover:shadow-md transition-all duration-150',
            'border-l-[3px] z-20',
            canDrag && 'cursor-grab active:cursor-grabbing',
            isUrgent && 'ring-1 ring-red-400 animate-pulse',
            isHigh && 'ring-1 ring-amber-400',
            className
          )}
          style={{
            ...style,
            backgroundColor: `${bgColor}cc`,
            borderLeftColor: bgColor,
            transform: transformStyle,
            opacity: isDragging ? 0.65 : 1,
          }}
        >
          <div className="truncate">
            {assignment.title || typeLabel}
            {shortTimeLabel && <span className="text-white/70"> · {shortTimeLabel}</span>}
          </div>
          {style?.height > 28 && (
            <>
              {customerName && (
                <div className="truncate text-white/90 text-[9px]">
                  {customerName}
                </div>
              )}
              {(shortAddress || employeeInitials) && (
                <div className="truncate text-white/70 text-[9px]">
                  {[shortAddress, employeeInitials].filter(Boolean).join(' · ')}
                </div>
              )}
            </>
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
              {assignment.title || typeLabel}
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
            <DetailLine icon={Clock}>
              {format(new Date(assignment.startDatetime), 'EEE d. MMM, HH:mm', { locale: de })} - {format(new Date(assignment.endDatetime), 'HH:mm')}
            </DetailLine>
            <DetailLine icon={Hash}>
              {assignment.assignmentNumber ? `#${assignment.assignmentNumber}` : ''}
            </DetailLine>
            <DetailLine icon={User}>
              {customerName}
            </DetailLine>
            <DetailLine icon={MapPin}>
              {siteAddress}
            </DetailLine>
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
