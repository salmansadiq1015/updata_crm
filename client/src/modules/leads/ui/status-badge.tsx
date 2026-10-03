'use client';

import { BadgeCheck, CircleCheck, CircleOff, PhoneCall, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadStatus } from '../types/lead-types';
import { useLanguage } from './lead-ui-kit';
import { getLeadStatusLabel } from './lead-ui-constants';

type LeadStatusMeta = {
  icon: LucideIcon;
  /** Pill: tinted background + readable text + hairline ring. */
  pill: string;
  /** Bare icon colour, for menus and select items. */
  iconClassName: string;
};

/**
 * Lead status → semantic colour + icon. Status is never conveyed by colour
 * alone: every state has its own icon *and* a text label.
 *
 *   new         primary   sparkles
 *   contacted   blue      phone
 *   qualified   green     badge-check
 *   unqualified muted     circle-off
 *   converted   green     circle-check (stronger tint: the terminal, won state)
 */
export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusMeta> = {
  new: {
    icon: Sparkles,
    pill: 'bg-primary/10 text-primary ring-primary/25',
    iconClassName: 'text-primary',
  },
  contacted: {
    icon: PhoneCall,
    pill: 'bg-blue-500/10 text-blue-700 ring-blue-500/25 dark:text-blue-400',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
  qualified: {
    icon: BadgeCheck,
    pill: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400',
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
  },
  unqualified: {
    icon: CircleOff,
    pill: 'bg-muted text-muted-foreground ring-border',
    iconClassName: 'text-muted-foreground',
  },
  converted: {
    icon: CircleCheck,
    pill: 'bg-emerald-600/15 text-emerald-800 ring-emerald-600/35 dark:bg-emerald-500/20 dark:text-emerald-300',
    iconClassName: 'text-emerald-700 dark:text-emerald-300',
  },
};

type LeadStatusBadgeProps = {
  status: LeadStatus;
  size?: 'sm' | 'md';
  /** Hide the visible label (icon only); the accessible name is kept. */
  iconOnly?: boolean;
  className?: string;
};

export function LeadStatusBadge({ status, size = 'sm', iconOnly = false, className }: LeadStatusBadgeProps) {
  const { t } = useLanguage();
  const meta = LEAD_STATUS_META[status] ?? LEAD_STATUS_META.new;
  const Icon = meta.icon;
  const label = getLeadStatusLabel(t, status);

  return (
    <span
      data-status={status}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs',
        meta.pill,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}
