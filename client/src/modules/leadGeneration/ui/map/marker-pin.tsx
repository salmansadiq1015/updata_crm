'use client';

import { Sparkles, Building2, CopyCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchingStatus } from '../../types/discovery-types';

// Marker visuals are driven by `status` but are never color-only (accessibility,
// §69 / branding §18): each status also carries a distinct icon + shape so the
// meaning survives greyscale / color-blindness. Tokens only — NEW is emphasized
// via the brand primary; EXISTING is neutral; POSSIBLE_DUPLICATE uses warning/amber.

interface MarkerPinProps {
  status: MatchingStatus;
  selected?: boolean;
  hovered?: boolean;
}

const STATUS_ICON: Record<MatchingStatus, LucideIcon> = {
  NEW: Sparkles,
  EXISTING: Building2,
  POSSIBLE_DUPLICATE: CopyCheck,
};

// Full literal class strings (no interpolation) so Tailwind's scanner emits them.
const STATUS_CLASSES: Record<MatchingStatus, string> = {
  NEW: 'bg-primary text-primary-foreground border-primary',
  EXISTING: 'bg-card text-muted-foreground border-border',
  POSSIBLE_DUPLICATE: 'bg-warning text-warning-foreground border-warning',
};

export function MarkerPin({ status, selected = false, hovered = false }: MarkerPinProps) {
  const Icon = STATUS_ICON[status];
  const emphasized = selected || hovered;

  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full border shadow-theme-sm',
        'transition-transform duration-150 ease-out',
        STATUS_CLASSES[status],
        selected
          ? 'h-9 w-9 scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background'
          : hovered
            ? 'h-8 w-8 scale-105 ring-2 ring-primary/50'
            : 'h-7 w-7',
      )}
    >
      <Icon
        className={cn('shrink-0', selected ? 'h-5 w-5' : emphasized ? 'h-4 w-4' : 'h-3.5 w-3.5')}
        aria-hidden="true"
      />
    </span>
  );
}
