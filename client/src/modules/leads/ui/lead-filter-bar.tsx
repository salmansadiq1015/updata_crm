'use client';

import { Circle, Filter, Search, UserRound, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadSource, LeadStatus } from '../types/lead-types';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useLanguage,
} from './lead-ui-kit';
import {
  FILTER_ALL,
  FILTER_ME,
  LEAD_SOURCES,
  LEAD_SOURCE_ICON,
  LEAD_STATUSES,
  getLeadSourceLabel,
  getLeadStatusLabel,
} from './lead-ui-constants';
import { LEAD_STATUS_META } from './status-badge';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';

type LeadFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: LeadStatus | typeof FILTER_ALL;
  onStatusChange: (value: LeadStatus | typeof FILTER_ALL) => void;
  source: LeadSource | typeof FILTER_ALL;
  onSourceChange: (value: LeadSource | typeof FILTER_ALL) => void;
  /** `ALL`, `ME`, or a user id. */
  assignedTo: string;
  onAssignedToChange: (value: string) => void;
  users?: LeadUser[];
  hasActiveFilters: boolean;
  onClear: () => void;
};

const BASE_TRIGGER =
  'h-8 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground data-[size=default]:h-8';
const ACTIVE_TRIGGER = 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary';

/**
 * Pill-style filter bar for the leads list (mirrors the customers filter bar).
 * Presentational: state lives in the leads store and is owned by the list view.
 */
export function LeadFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  source,
  onSourceChange,
  assignedTo,
  onAssignedToChange,
  users = [],
  hasActiveFilters,
  onClear,
}: LeadFilterBarProps) {
  const { t } = useLanguage();

  return (
    <div
      role="search"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{t('common.filter', 'Filter')}</span>
      </div>
      <div className="h-5 w-px bg-muted/70" aria-hidden="true" />

      <div className="relative min-w-[200px] max-w-xs flex-1">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/80"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          maxLength={100}
          placeholder={t('leads.search.placeholder', 'Search leads…')}
          aria-label={t('leads.search.label', 'Search leads')}
          className="h-9 w-full rounded-xl border border-border bg-muted/50 pe-3 ps-9 text-[13px] text-foreground transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <Select value={status} onValueChange={(value) => onStatusChange(value as LeadStatus | typeof FILTER_ALL)}>
        <SelectTrigger
          aria-label={t('leads.filter.status', 'Status')}
          className={cn(BASE_TRIGGER, status !== FILTER_ALL && ACTIVE_TRIGGER, 'w-[160px]')}
        >
          <SelectValue placeholder={t('leads.filter.status', 'Status')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allStatuses', 'All statuses')}>
            <span className="flex items-center gap-2">
              <Circle className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
              {t('leads.filter.allStatuses', 'All statuses')}
            </span>
          </SelectItem>
          {LEAD_STATUSES.map((value) => {
            const Icon = LEAD_STATUS_META[value].icon;
            return (
              <SelectItem key={value} value={value} textValue={getLeadStatusLabel(t, value)}>
                <span className="flex items-center gap-2">
                  <Icon className={cn('h-3.5 w-3.5', LEAD_STATUS_META[value].iconClassName)} aria-hidden="true" />
                  {getLeadStatusLabel(t, value)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select value={source} onValueChange={(value) => onSourceChange(value as LeadSource | typeof FILTER_ALL)}>
        <SelectTrigger
          aria-label={t('leads.filter.source', 'Source')}
          className={cn(BASE_TRIGGER, source !== FILTER_ALL && ACTIVE_TRIGGER, 'w-[160px]')}
        >
          <SelectValue placeholder={t('leads.filter.source', 'Source')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allSources', 'All sources')}>
            <span className="flex items-center gap-2">
              <Circle className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
              {t('leads.filter.allSources', 'All sources')}
            </span>
          </SelectItem>
          {LEAD_SOURCES.map((value) => {
            const Icon = LEAD_SOURCE_ICON[value];
            return (
              <SelectItem key={value} value={value} textValue={getLeadSourceLabel(t, value)}>
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {getLeadSourceLabel(t, value)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select value={assignedTo} onValueChange={onAssignedToChange}>
        <SelectTrigger
          aria-label={t('leads.filter.assignee', 'Assigned to')}
          className={cn(BASE_TRIGGER, assignedTo !== FILTER_ALL && ACTIVE_TRIGGER, 'w-[180px]')}
        >
          <SelectValue placeholder={t('leads.filter.assignee', 'Assigned to')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="max-h-72">
          <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allAssignees', 'Everyone')}>
            <span className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
              {t('leads.filter.allAssignees', 'Everyone')}
            </span>
          </SelectItem>
          <SelectItem value={FILTER_ME} textValue={t('leads.filter.assignedToMe', 'Assigned to me')}>
            <span className="flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {t('leads.filter.assignedToMe', 'Assigned to me')}
            </span>
          </SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id} textValue={getUserDisplayName(user)}>
              <span className="flex items-center gap-2">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {getUserDisplayName(user)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <>
          <div className="h-5 w-px bg-muted/70" aria-hidden="true" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-full text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onClear}
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {t('common.reset', 'Reset')}
          </Button>
        </>
      )}
    </div>
  );
}
