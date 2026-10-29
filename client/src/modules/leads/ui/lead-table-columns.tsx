'use client';

import { useMemo } from 'react';
import { AlertTriangle, AtSign, Building2, Copy, MapPin, Pencil, Phone, Plus, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/formatters';
import type { Lead } from '../types/lead-types';
import { Button, useLanguage } from './lead-ui-kit';
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
  getLeadAreaLabel,
  getLeadBusinessTypeLabel,
  getLeadCreatorName,
  getUserDisplayName,
  getUserInitials,
  toMailtoHref,
  toTelHref,
} from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { LeadStatusBadge } from './status-badge';
import { LeadScoreBadge } from './lead-score-badge';
import { LeadSlaBadge } from './lead-sla-badge';
import { RatingStars } from './rating-stars';
import { LtrText } from './ltr-text';
import { isValidLeadPhone } from './lead-contact-validation';
import type { LeadContactField } from './lead-contact-editor';

/** A value that is really just a postal code is not a place name. */
const isBarePostal = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /^[\d\s-]{3,}$/.test(value.trim());

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
  canWrite: boolean;
  onOpen: (lead: Lead) => void;
  onCopyPhone: (phone: string) => void;
  onEditContact: (lead: Lead, field: LeadContactField) => void;
};

/**
 * Column set for the leads table:
 * lead number · name · email · phone · status · type (real category) · source ·
 * area · city · country · rating (+reviews) · assignee · creator · discovered.
 *
 * Only name, status and the date column sort — those are the fields the API
 * accepts for `sortBy`. The compact grid/card view + the detail drawer are the
 * responsive layers for the wider business-data columns.
 */
export function useLeadColumns({ users, canWrite, onOpen, onCopyPhone, onEditContact }: UseLeadColumnsArgs): ShellColumn<Lead>[] {
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
              </div>
            </div>
          );
        },
      },
      {
        id: 'email',
        header: t('leads.col.email', 'Email'),
        size: 225,
        enableSorting: false,
        Cell: ({ row }) => {
          const lead = row.original;
          const email = lead.email?.trim() ?? '';
          const href = toMailtoHref(email);
          if (!email) {
            return canWrite ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={t('leads.contact.addEmailFor', 'Add email for {name}', { name: lead.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  onEditContact(lead, 'email');
                }}
                className="h-7 gap-1.5 border border-dashed border-primary/30 px-2 text-[11px] font-semibold text-primary hover:border-primary/50 hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('leads.contact.addEmail', 'Add email')}
              </Button>
            ) : <Dash />;
          }
          return (
            <div className="group/contact flex min-w-0 items-center gap-2 whitespace-normal">
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1',
                href ? 'bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-400' : 'bg-destructive/10 text-destructive ring-destructive/20',
              )}>
                {href ? <AtSign className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                {href ? (
                  <a
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    className="block truncate text-[12px] font-medium text-foreground hover:text-primary hover:underline"
                    title={email}
                  >
                    <LtrText>{email}</LtrText>
                  </a>
                ) : (
                  <>
                    <span className="block truncate text-[12px] text-destructive" title={email}><LtrText>{email}</LtrText></span>
                    <span className="text-[10px] font-medium text-destructive">{t('leads.contact.invalidEmail', 'Invalid email')}</span>
                  </>
                )}
              </div>
              {canWrite && (
                <button
                  type="button"
                  aria-label={t('leads.contact.editEmailFor', 'Edit email for {name}', { name: lead.name })}
                  title={t('leads.contact.editEmail', 'Edit email')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditContact(lead, 'email');
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/contact:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: 'phone',
        header: t('leads.col.phone', 'Phone'),
        size: 205,
        enableSorting: false,
        Cell: ({ row }) => {
          const lead = row.original;
          const phone = lead.phone ?? lead.mobile;
          if (!phone) {
            return canWrite ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={t('leads.contact.addPhoneFor', 'Add phone for {name}', { name: lead.name })}
                onClick={(event) => {
                  event.stopPropagation();
                  onEditContact(lead, 'phone');
                }}
                className="h-7 gap-1.5 border border-dashed border-primary/30 px-2 text-[11px] font-semibold text-primary hover:border-primary/50 hover:bg-primary/10"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('leads.contact.addPhone', 'Add phone')}
              </Button>
            ) : <Dash />;
          }
          const valid = isValidLeadPhone(phone);
          const href = valid ? toTelHref(phone) : null;
          return (
            <div className="group/contact flex min-w-0 items-center gap-2 whitespace-normal">
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1',
                valid ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400' : 'bg-destructive/10 text-destructive ring-destructive/20',
              )}>
                {valid ? <Phone className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <div className="min-w-0 flex-1">
                {href ? (
                  <a
                    href={href}
                    onClick={(event) => event.stopPropagation()}
                    className="block truncate text-[12px] font-medium text-foreground hover:text-primary hover:underline"
                    title={formatPhone(phone) || phone}
                  >
                    <LtrText>{formatPhone(phone) || phone}</LtrText>
                  </a>
                ) : (
                  <>
                    <span className="block truncate text-[12px] text-destructive" title={phone}><LtrText>{phone}</LtrText></span>
                    <span className="text-[10px] font-medium text-destructive">{t('leads.contact.invalidPhone', 'Invalid number')}</span>
                  </>
                )}
              </div>
              {valid && (
                <button
                  type="button"
                  aria-label={t('leads.contact.copyPhoneFor', 'Copy phone for {name}', { name: lead.name })}
                  title={t('leads.action.copyPhone', 'Copy phone number')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopyPhone(phone);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/contact:opacity-100"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  aria-label={t('leads.contact.editPhoneFor', 'Edit phone for {name}', { name: lead.name })}
                  title={t('leads.contact.editPhone', 'Edit phone')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditContact(lead, 'phone');
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/contact:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('leads.col.status', 'Status'),
        size: 180,
        Cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <LeadStatusBadge status={row.original.status} />
            <LeadSlaBadge sla={row.original.sla} />
          </div>
        ),
      },
      {
        // Lead quality: sorts server-side by the denormalized scoreValue.
        id: 'score',
        accessorFn: (lead) => lead.score?.value ?? -1,
        sortDescFirst: true,
        header: t('leads.score.col', 'Score'),
        size: 130,
        Cell: ({ row }) => <LeadScoreBadge score={row.original.score} />,
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
          // Show the REAL business category ("Hotel", "Restaurant") as the primary
          // value; the generic Business/Private kind becomes the secondary line.
          const category = getLeadBusinessTypeLabel(lead);
          const kindLabel = getLeadTypeLabel(t, lead.type);
          return (
            <div className="flex min-w-0 flex-col items-start gap-1 whitespace-normal">
              <span
                className={cn(
                  'inline-flex max-w-[135px] items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold',
                  lead.type === 'business'
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
                )}
                title={category ?? kindLabel}
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{category ?? kindLabel}</span>
              </span>
              {category && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {kindLabel}
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
        size: 150,
        enableSorting: false,
        Cell: ({ row }) => {
          // The BUSINESS's own neighborhood/area — never the postal code, and never
          // the (separate) search region the lead was discovered in.
          const areaName = getLeadAreaLabel(row.original.address);
          const { canton, region } = row.original.address;
          const subLine = canton ?? region;
          if (!areaName) return <Dash />;
          return (
            <span className="inline-flex min-w-0 items-center gap-2 whitespace-normal">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/15 dark:text-emerald-400">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground" title={areaName}>{areaName}</span>
                {subLine && (
                  <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {subLine}
                  </span>
                )}
              </span>
            </span>
          );
        },
      },
      {
        id: 'city',
        header: t('leads.col.city', 'City'),
        size: 130,
        enableSorting: false,
        Cell: ({ row }) => {
          const { city } = row.original.address;
          if (!city || isBarePostal(city)) return <Dash />;
          return <span className="block truncate text-[13px] text-foreground" title={city}>{city}</span>;
        },
      },
      {
        id: 'country',
        header: t('leads.col.country', 'Country'),
        size: 110,
        enableSorting: false,
        Cell: ({ row }) => {
          const { country } = row.original.address;
          if (!country) return <Dash />;
          return <span className="text-[13px] font-medium uppercase tracking-wide text-foreground">{country}</span>;
        },
      },
      {
        id: 'rating',
        header: t('leads.col.rating', 'Rating'),
        size: 150,
        enableSorting: false,
        Cell: ({ row }) => {
          const { rating, reviewCount } = row.original.providerMeta;
          if (rating == null) return <Dash />;
          return (
            <span className="inline-flex min-w-0 flex-col items-start gap-0.5 whitespace-normal">
              <span className="inline-flex items-center gap-1.5">
                <RatingStars rating={rating} size={13} />
                <span className="text-[13px] font-semibold text-foreground">{rating.toFixed(1)}</span>
              </span>
              {reviewCount != null && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {reviewCount.toLocaleString(locale)} {t('leads.col.reviews', 'reviews')}
                </span>
              )}
            </span>
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
    [t, locale, users, canWrite, onOpen, onCopyPhone, onEditContact],
  );
}
