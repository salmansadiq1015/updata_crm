'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { AVAILABILITY_TYPE_META } from '../../constants/deploy-constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const CalendarAvailabilityBar = memo(function CalendarAvailabilityBar({ availability }) {
  if (!availability || availability.availabilityType === 'WORKING') return null;

  const meta = AVAILABILITY_TYPE_META[availability.availabilityType];
  if (!meta) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'absolute inset-0 pointer-events-auto cursor-default',
            meta.color,
            'opacity-40'
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">{meta.label}</p>
        {availability.notes && <p className="text-muted-foreground">{availability.notes}</p>}
      </TooltipContent>
    </Tooltip>
  );
});
