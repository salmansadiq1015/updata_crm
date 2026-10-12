'use client';

import type { ReactNode } from 'react';
import {
  Building2,
  CheckCircle2,
  Circle,
  Globe2,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  User,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  LeadFilterOptions,
  LeadSource,
  LeadStatus,
  LeadType,
} from '../types/lead-types';
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
  LEAD_TYPES,
  getLeadSourceLabel,
  getLeadStatusLabel,
  getLeadTypeLabel,
} from './lead-ui-constants';
import { LEAD_STATUS_META } from './status-badge';
import { getUserDisplayName, humanizeBusinessType } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';

type LeadFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: LeadStatus | typeof FILTER_ALL;
  onStatusChange: (value: LeadStatus | typeof FILTER_ALL) => void;
  source: LeadSource | typeof FILTER_ALL;
  onSourceChange: (value: LeadSource | typeof FILTER_ALL) => void;
  type: LeadType | typeof FILTER_ALL;
  onTypeChange: (value: LeadType | typeof FILTER_ALL) => void;
  country: string;
  onCountryChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  area: string;
  onAreaChange: (value: string) => void;
  /** A business category returned by `GET /crm/leads/filter-options`, or `ALL`. */
  businessType: string;
  onBusinessTypeChange: (value: string) => void;
  filterOptions?: LeadFilterOptions;
  filterOptionsLoading?: boolean;
  /** `ALL`, `ME`, or a user id. */
  assignedTo: string;
  onAssignedToChange: (value: string) => void;
  users?: LeadUser[];
  hasActiveFilters: boolean;
  onClear: () => void;
};

const TRIGGER =
  'h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-[13px] font-medium text-foreground shadow-sm transition-all hover:border-primary/30 hover:bg-background focus:ring-2 focus:ring-primary/15 data-[size=default]:h-10';
const ACTIVE_TRIGGER = 'border-primary/35 bg-primary/[0.07] text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.04)]';

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        {label}
      </span>
      {children}
    </div>
  );
}

function CountBadge({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return (
    <span className="ms-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

/**
 * Premium two-tier filter workspace. Every control is server-backed; in
 * particular Country, City and Area are populated from the corresponding lead
 * address fields and cascade without using discovery-location approximations.
 */
export function LeadFilterBar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  source,
  onSourceChange,
  type,
  onTypeChange,
  country,
  onCountryChange,
  city,
  onCityChange,
  area,
  onAreaChange,
  businessType,
  onBusinessTypeChange,
  filterOptions,
  filterOptionsLoading = false,
  assignedTo,
  onAssignedToChange,
  users = [],
  hasActiveFilters,
  onClear,
}: LeadFilterBarProps) {
  const { t } = useLanguage();
  const typeCounts = new Map(filterOptions?.types.map((option) => [option.value, option.count]) ?? []);
  const cityOptions = (filterOptions?.cities ?? []).filter((option) =>
    country === FILTER_ALL || option.countryId === country);
  const areaOptions = (filterOptions?.areas ?? []).filter((option) =>
    (country === FILTER_ALL || option.countryId === country)
    && (city === FILTER_ALL || option.cityId === city));
  const activeFilterCount = [
    search.trim(),
    status !== FILTER_ALL,
    source !== FILTER_ALL,
    type !== FILTER_ALL,
    country !== FILTER_ALL,
    city !== FILTER_ALL,
    area !== FILTER_ALL,
    businessType !== FILTER_ALL,
    assignedTo !== FILTER_ALL,
  ].filter(Boolean).length;

  return (
    <section
      role="search"
      aria-label={t('leads.filter.title', 'Lead filters')}
      className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-theme-sm"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/[0.07] via-transparent to-sky-500/[0.05]"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-[185px] items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {activeFilterCount > 0 && (
                <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-foreground">{t('leads.filter.title', 'Smart filters')}</h2>
                <Sparkles className="h-3 w-3 text-primary/70" aria-hidden="true" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('leads.filter.subtitle', 'Refine your pipeline instantly')}
              </p>
            </div>
          </div>

          <div className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              maxLength={100}
              placeholder={t('leads.search.placeholder', 'Search by name, area, city, business type or owner…')}
              aria-label={t('leads.search.label', 'Search leads')}
              className="h-11 w-full rounded-xl border border-border/70 bg-background/80 pe-10 ps-10 text-[13px] text-foreground shadow-sm transition-all placeholder:text-muted-foreground/60 hover:border-primary/25 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t('leads.filter.clearSearch', 'Clear search')}
                className="absolute end-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1.5 rounded-lg px-3 text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={onClear}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.reset', 'Reset all')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <FilterField label={t('leads.filter.status', 'Status')}>
            <Select value={status} onValueChange={(value) => onStatusChange(value as LeadStatus | typeof FILTER_ALL)}>
              <SelectTrigger
                aria-label={t('leads.filter.status', 'Status')}
                className={cn(TRIGGER, status !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.status', 'Status')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6}>
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
          </FilterField>

          <FilterField label={t('leads.filter.source', 'Source')}>
            <Select value={source} onValueChange={(value) => onSourceChange(value as LeadSource | typeof FILTER_ALL)}>
              <SelectTrigger
                aria-label={t('leads.filter.source', 'Source')}
                className={cn(TRIGGER, source !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.source', 'Source')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6}>
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
          </FilterField>

          <FilterField label={t('leads.filter.type', 'Lead type')}>
            <Select value={type} onValueChange={(value) => onTypeChange(value as LeadType | typeof FILTER_ALL)}>
              <SelectTrigger
                aria-label={t('leads.filter.type', 'Lead type')}
                className={cn(TRIGGER, type !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.type', 'Lead type')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6}>
                <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allTypes', 'All types')}>
                  <span className="flex w-full items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                    {t('leads.filter.allTypes', 'All types')}
                  </span>
                </SelectItem>
                {LEAD_TYPES.map((value) => {
                  const Icon = value === 'business' ? Building2 : User;
                  return (
                    <SelectItem key={value} value={value} textValue={getLeadTypeLabel(t, value)}>
                      <span className="flex w-full min-w-36 items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {getLeadTypeLabel(t, value)}
                        <CountBadge count={typeCounts.get(value)} />
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('leads.filter.businessType', 'Business type')}>
            <Select value={businessType} onValueChange={onBusinessTypeChange}>
              <SelectTrigger
                aria-label={t('leads.filter.businessType', 'Business type')}
                className={cn(TRIGGER, businessType !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.businessType', 'Business type')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="max-h-80">
                <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allBusinessTypes', 'All business types')}>
                  <span className="flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                    {t('leads.filter.allBusinessTypes', 'All business types')}
                  </span>
                </SelectItem>
                {filterOptions?.businessTypes.map((option) => {
                  const label = humanizeBusinessType(option.value) ?? option.value;
                  return (
                    <SelectItem key={option.value} value={option.value} textValue={label}>
                      <span className="flex w-full min-w-44 items-center gap-2">
                        <Store className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                        <CountBadge count={option.count} />
                      </span>
                    </SelectItem>
                  );
                })}
                {!filterOptionsLoading && (filterOptions?.businessTypes.length ?? 0) === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('leads.filter.noBusinessTypes', 'No business types available yet')}
                  </div>
                )}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('leads.filter.country', 'Country')}>
            <Select value={country} onValueChange={onCountryChange}>
              <SelectTrigger
                aria-label={t('leads.filter.country', 'Country')}
                className={cn(TRIGGER, country !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.country', 'Country')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="max-h-80">
                <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allCountries', 'All countries')}>
                  <span className="flex items-center gap-2">
                    <Globe2 className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                    {t('leads.filter.allCountries', 'All countries')}
                  </span>
                </SelectItem>
                {filterOptions?.countries.map((option) => (
                  <SelectItem key={option.id} value={option.id} textValue={option.value}>
                    <span className="flex w-full min-w-36 items-center gap-2">
                      <Globe2 className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden="true" />
                      <span className="truncate">{option.value}</span>
                      <CountBadge count={option.count} />
                    </span>
                  </SelectItem>
                ))}
                {!filterOptionsLoading && (filterOptions?.countries.length ?? 0) === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('leads.filter.noCountries', 'No countries available yet')}
                  </div>
                )}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('leads.filter.city', 'City')}>
            <Select value={city} onValueChange={onCityChange}>
              <SelectTrigger
                aria-label={t('leads.filter.city', 'City')}
                className={cn(TRIGGER, city !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.city', 'City')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="max-h-80">
                <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allCities', 'All cities')}>
                  <span className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                    {t('leads.filter.allCities', 'All cities')}
                  </span>
                </SelectItem>
                {cityOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} textValue={option.value}>
                    <span className="flex w-full min-w-40 items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden="true" />
                      <span className="truncate">{option.value}</span>
                      <CountBadge count={option.count} />
                    </span>
                  </SelectItem>
                ))}
                {!filterOptionsLoading && cityOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('leads.filter.noCities', 'No cities available for this country')}
                  </div>
                )}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('leads.filter.area', 'Area')}>
            <Select value={area} onValueChange={onAreaChange}>
              <SelectTrigger
                aria-label={t('leads.filter.area', 'Area')}
                className={cn(TRIGGER, area !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.area', 'Area')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="max-h-80">
                <SelectItem value={FILTER_ALL} textValue={t('leads.filter.allAreas', 'All areas')}>
                  <span className="flex items-center gap-2">
                    <MapIcon className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
                    {t('leads.filter.allAreas', 'All areas')}
                  </span>
                </SelectItem>
                {areaOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} textValue={option.value}>
                    <span className="flex w-full min-w-40 items-center gap-2">
                      <MapIcon className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden="true" />
                      <span className="truncate">{option.value}</span>
                      <CountBadge count={option.count} />
                    </span>
                  </SelectItem>
                ))}
                {!filterOptionsLoading && areaOptions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('leads.filter.noAreas', 'No areas available for this location')}
                  </div>
                )}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label={t('leads.filter.assignee', 'Owner')}>
            <Select value={assignedTo} onValueChange={onAssignedToChange}>
              <SelectTrigger
                aria-label={t('leads.filter.assignee', 'Assigned to')}
                className={cn(TRIGGER, assignedTo !== FILTER_ALL && ACTIVE_TRIGGER)}
              >
                <SelectValue placeholder={t('leads.filter.assignee', 'Assigned to')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="max-h-72">
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
          </FilterField>
        </div>
      </div>
    </section>
  );
}
