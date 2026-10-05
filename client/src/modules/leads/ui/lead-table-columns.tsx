'use client';

import { useMemo } from 'react';
import { Building2, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/formatters';
import type { Lead } from '../types/lead-types';
import { useLanguage } from './lead-ui-kit';
import type { ShellColumn } from './lead-ui-kit';
import {
  LEAD_SOURCE_ICON,
  getLeadDiscoveredAt,
  getLeadSourceLabel,
  getLeadTypeLabel,
} from './lead-ui-constants';
import {
  findUser,
  formatLeadDate,
  getLeadCreatorName,
  getUserDisplayName,
  getUserInitials,
} from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { LeadStatusBadge } from './status-badge';
import { LtrText } from './ltr-text';

const Dash = () => <span className="text-[13px] text-muted-foreground/60">—</span>;

/** Small round avatar with the user's initials, plus the name. */
export function AssigneeLabel({
  userId,
  users,
  className,
}: {
  userId: string | null;
  users: readonly LeadUser[];
  className?: string;
}) {
  const { t } = useLanguage();
  if (!userId) return <Dash />;
  const user = findUser(users, userId);
  const name = getUserDisplayName(user);
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 whitespace-normal', className)}>
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
      >
        {user ? getUserInitials(user) : '?'}
      </span>
      <span className={cn('min-w-0 break-words text-[13px]', !user && 'text-muted-foreground')}>
        {name || t('leads.assignee.unknown', 'Unknown user')}
      </span>
    </span>
  );
}

type UseLeadColumnsArgs = {
  users: readonly LeadUser[];
  onOpen: (lead: Lead) => void;
  onCopyPhone: (phone: string) => void;
};

/**
 * Column set for the leads table:
 * lead number · name · type · status · source · area · phone · assignee · creator · discovered.
 *
 * Only name, status and the date column sort — those are the fields the API
 * accepts for `sortBy`.
 */
export function useLeadColumns({ users, onOpen, onCopyPhone }: UseLeadColumnsArgs): ShellColumn<Lead>[] {
  const { t, locale } = useLanguage();

  return useMemo<ShellColumn<Lead>[]>(
    () => [
      {
        id: 'leadNumber',
        header: t('leads.col.leadNumber', 'Lead #'),
        size: 92,
        Cell: ({ row }) =>
          row.original.leadNumber ? (
            <span className="font-mono text-[12px] text-muted-foreground">{row.original.leadNumber}</span>
          ) : (
            <Dash />
          ),
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('leads.col.name', 'Name'),
        size: 280,
        Cell: ({ row }) => {
          const lead = row.original;
          const isBusiness = lead.type === 'business';
          const Icon = isBusiness ? Building2 : User;
          return (
            <div className="flex min-w-0 items-center gap-3 whitespace-normal">
              <div
                aria-hidden="true"
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1',
                  isBusiness
                    ? 'bg-primary/10 text-primary ring-primary/20'
                    : 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {/* Table cells are `whitespace-nowrap` by default; long names opt back in
                  to wrapping (two lines at most) instead of stretching the table past
                  the viewport, which would push the row actions off screen. */}
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(lead);
                  }}
                  className="block rounded-sm text-start text-[13px] font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="line-clamp-2 break-words">{lead.name || '—'}</span>
                </button>
                {lead.email && (
                  <p className="line-clamp-1 break-all text-xs text-muted-foreground">
                    <LtrText>{lead.email}</LtrText>
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('leads.col.status', 'Status'),
        size: 140,
        Cell: ({ row }) => <LeadStatusBadge status={row.original.status} />,
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: t('leads.col.type', 'Type'),
        size: 145,
        enableSorting: false,
        Cell: ({ row }) => {
          const lead = row.original;
          const Icon = lead.type === 'business' ? Building2 : User;
          const businessType = lead.sourceMetadata.businessType
            ?.replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
          return (
            <div className="flex min-w-0 flex-col items-start gap-1 whitespace-normal">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                  lead.type === 'business'
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
                )}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {getLeadTypeLabel(t, lead.type)}
              </span>
              {businessType && (
                <span className="line-clamp-1 max-w-[135px] text-[10px] font-medium text-muted-foreground" title={businessType}>
                  {businessType}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'source',
        header: t('leads.col.source', 'Source'),
        size: 140,
        Cell: ({ row }) => {
          const Icon = LEAD_SOURCE_ICON[row.original.source];
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-normal text-[13px] text-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{getLeadSourceLabel(t, row.original.source)}</span>
            </span>
          );
        },
      },
      {
        id: 'area',
        header: t('leads.col.area', 'Area'),
        size: 145,
        enableSorting: false,
        Cell: ({ row }) => {
          const { city, canton, country } = row.original.address;
          const selectedLocation = row.original.sourceMetadata.discoveryLocation;
          const areaName = selectedLocation?.city
            ?? selectedLocation?.name
            ?? selectedLocation?.formattedAddress
            ?? city
            ?? canton;
          const areaRegion = selectedLocation
            ? selectedLocation.region ?? canton
            : canton;
          const areaCountry = selectedLocation
            ? selectedLocation.countryCode ?? selectedLocation.country ?? country
            : country;
          if (!areaName) return <Dash />;
          return (
            <span className="inline-flex min-w-0 items-center gap-2 whitespace-normal">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/15 dark:text-emerald-400">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground" title={areaName}>{areaName}</span>
                {(areaRegion || areaCountry) && (
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {[areaRegion, areaCountry].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </span>
          );
        },
      },
      {
        id: 'phone',
        header: t('leads.col.phone', 'Phone'),
        size: 150,
        Cell: ({ row }) => {
          const phone = row.original.phone ?? row.original.mobile;
          if (!phone) return <Dash />;
          return (
            <button
              type="button"
              title={t('leads.action.copyPhone', 'Copy phone number')}
              onClick={(event) => {
                event.stopPropagation();
                onCopyPhone(phone);
              }}
              className="rounded-sm text-[13px] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LtrText>{formatPhone(phone) || phone}</LtrText>
            </button>
          );
        },
      },
      {
        id: 'assignedTo',
        header: t('leads.col.assignedTo', 'Assigned to'),
        size: 160,
        Cell: ({ row }) => <AssigneeLabel userId={row.original.assignedTo} users={users} />,
      },
      {
        // Provenance, not ownership: plain text next to the assignee's avatar label.
        // No accessor, so it cannot sort (the API has no createdBy sort).
        id: 'createdBy',
        header: t('leads.col.createdBy', 'Created by'),
        size: 150,
        Cell: ({ row }) => {
          const name = getLeadCreatorName(row.original.createdBy, users);
          return name ? (
            <span className="whitespace-normal break-words text-[13px] text-foreground">{name}</span>
          ) : (
            <Dash />
          );
        },
      },
      {
        id: 'discoveredAt',
        accessorFn: (lead) => getLeadDiscoveredAt(lead),
        // Newest first: otherwise the first click would flip a default
        // newest-first list to oldest-first and the cycle would feel stuck.
        sortDescFirst: true,
        header: t('leads.col.discoveredAt', 'Discovered'),
        size: 116,
        Cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13px] text-muted-foreground">
            {formatLeadDate(getLeadDiscoveredAt(row.original), locale)}
          </span>
        ),
      },
    ],
    [t, locale, users, onOpen, onCopyPhone],
  );
}
