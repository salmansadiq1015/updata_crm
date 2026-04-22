'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Filter, Search, X } from 'lucide-react';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { DotLabel } from '@/shared/components/filter-dot';

/**
 * Filter bar for the customers list.
 * State is owned by the parent (useCursorList feeds the server query).
 * Kept as a dumb presentational component — no data fetching here.
 */
export function CustomerFilterBar({
  t,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  cantonFilter,
  onCantonFilterChange,
  newsletterFilter,
  onNewsletterFilterChange,
  hasActiveFilters,
  onClear,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {t('common.filter', 'Filter')}
        </span>
      </div>
      <div className="w-px h-5 bg-border" />

      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('crm.searchPlaceholder', 'Search customers...')}
          className="w-full h-8 pl-9 pr-3 rounded-full border border-border bg-card text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-ring transition-all"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className={cn(
          'w-[150px] text-xs rounded-full border-dashed',
          statusFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
        )}>
          <SelectValue placeholder={t('crm.status', 'Status')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value="all"><DotLabel tone="muted">{t('crm.allStatus', 'All statuses')}</DotLabel></SelectItem>
          <SelectItem value="active"><DotLabel tone="emerald">{t('crm.statusActive', 'Active')}</DotLabel></SelectItem>
          <SelectItem value="archived"><DotLabel tone="slate">{t('crm.statusArchived', 'Archived')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className={cn(
          'w-[150px] text-xs rounded-full border-dashed',
          typeFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
        )}>
          <SelectValue placeholder={t('crm.type', 'Type')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value="all"><DotLabel tone="muted">{t('crm.allTypes', 'All types')}</DotLabel></SelectItem>
          <SelectItem value="private"><DotLabel tone="blue">{t('crm.typePrivate', 'Private')}</DotLabel></SelectItem>
          <SelectItem value="business"><DotLabel tone="emerald">{t('crm.typeBusiness', 'Business')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      <Select value={cantonFilter} onValueChange={onCantonFilterChange}>
        <SelectTrigger className={cn(
          'w-[150px] text-xs rounded-full border-dashed',
          cantonFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
        )}>
          <SelectValue placeholder={t('crm.canton', 'Canton')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="max-h-72">
          <SelectItem value="all">{t('crm.allCantons', 'All cantons')}</SelectItem>
          {CH_CANTONS.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                {c.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={newsletterFilter} onValueChange={onNewsletterFilterChange}>
        <SelectTrigger className={cn(
          'w-[150px] text-xs rounded-full border-dashed',
          newsletterFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
        )}>
          <SelectValue placeholder={t('crm.newsletter', 'Newsletter')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          <SelectItem value="all"><DotLabel tone="muted">{t('crm.allNewsletter', 'All')}</DotLabel></SelectItem>
          <SelectItem value="optin"><DotLabel tone="amber">{t('crm.optedIn', 'Opted in')}</DotLabel></SelectItem>
          <SelectItem value="optout"><DotLabel tone="slate">{t('crm.optedOut', 'Opted out')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <>
          <div className="w-px h-5 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground gap-1 rounded-full hover:text-destructive"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
            {t('common.reset', 'Reset')}
          </Button>
        </>
      )}
    </div>
  );
}
