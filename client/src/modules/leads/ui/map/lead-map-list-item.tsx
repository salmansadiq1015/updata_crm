'use client';

import { memo } from 'react';
import { Loader2, LocateFixed, MapPinOff, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lead } from '../../types/lead-types';
import { LeadStatusBadge } from '../status-badge';
import {
  findUser,
  formatAddressOneLine,
  getUserDisplayName,
  getUserInitials,
} from '../lead-ui-utils';
import type { LeadUser } from '../lead-ui-utils';
import { useLanguage } from '../lead-ui-kit';

type LeadMapListItemProps = {
  lead: Lead;
  users: readonly LeadUser[];
  selected: boolean;
  active: boolean;
  hovered: boolean;
  located: boolean;
  selectable: boolean;
  onToggleSelect: (id: string) => void;
  onActivate: (lead: Lead) => void;
  onHover: (id: string | null) => void;
  /** Geocode action — only shown for a location-less lead when the user can write. */
  canGeocode?: boolean;
  geocoding?: boolean;
  onGeocode?: (lead: Lead) => void;
};

function LeadMapListItemImpl({
  lead,
  users,
  selected,
  active,
  hovered,
  located,
  selectable,
  onToggleSelect,
  onActivate,
  onHover,
  canGeocode = false,
  geocoding = false,
  onGeocode,
}: LeadMapListItemProps) {
  const { t } = useLanguage();
  const assignee = findUser(users, lead.assignedTo);
  const address = formatAddressOneLine(lead.address);

  return (
    <div
      data-active={active || undefined}
      onMouseEnter={() => onHover(lead.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2.5 transition-colors',
        active
          ? 'border-primary/50 bg-primary/[0.06] shadow-theme-sm'
          : hovered
            ? 'border-border bg-muted/50'
            : 'border-transparent hover:bg-muted/40',
      )}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(lead.id)}
          aria-label={t('leads.map.list.selectOne', 'Select {name}', { name: lead.name })}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
        />
      )}

      <button
        type="button"
        onClick={() => onActivate(lead)}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">{lead.name}</span>
            <LeadStatusBadge status={lead.status} size="sm" iconOnly className="ms-auto" />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {address || (located ? t('leads.map.list.noAddress', 'No address') : null)}
            {!located && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <MapPinOff className="h-3 w-3" aria-hidden="true" />
                {t('leads.map.list.noLocation', 'No location')}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {lead.phone ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate" dir="ltr">{lead.phone}</span>
              </span>
            ) : null}
            {assignee ? (
              <span
                className="ms-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-muted px-1.5"
                title={getUserDisplayName(assignee)}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">
                  {getUserInitials(assignee)}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {!located && canGeocode && onGeocode ? (
        <button
          type="button"
          onClick={() => onGeocode(lead)}
          disabled={geocoding}
          title={t('leads.map.geocode.action', 'Geocode from address')}
          aria-label={t('leads.map.geocode.action', 'Geocode from address')}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {geocoding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}

export const LeadMapListItem = memo(LeadMapListItemImpl);
