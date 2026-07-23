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
  salesFilter,
  onSalesFilterChange,
  hasActiveFilters,
  onClear,
}) {
  const activeTriggerCls = 'border-brand-500/30 bg-brand-500/15 text-brand-700 dark:text-brand-300';
  const baseTriggerCls = 'rounded-full px-3 py-1.5 text-[12px] font-medium border border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all h-8';

  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {t('common.filter', 'Filter')}
        </span>
      </div>
      <div className="w-px h-5 bg-muted/70" />

      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/80" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('crm.searchPlaceholder', 'Search customers...')}
          className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-muted/50 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 transition-all"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className={cn(baseTriggerCls, statusFilter !== 'all' && activeTriggerCls, 'w-[150px]')}>
          <SelectValue placeholder={t('crm.status', 'Status')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
          <SelectItem value="all" className="text-foreground focus:bg-muted/60"><DotLabel tone="muted">{t('crm.allStatus', 'All statuses')}</DotLabel></SelectItem>
          <SelectItem value="active" className="text-foreground focus:bg-muted/60"><DotLabel tone="emerald">{t('crm.statusActive', 'Active')}</DotLabel></SelectItem>
          <SelectItem value="archived" className="text-foreground focus:bg-muted/60"><DotLabel tone="slate">{t('crm.statusArchived', 'Archived')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className={cn(baseTriggerCls, typeFilter !== 'all' && activeTriggerCls, 'w-[150px]')}>
          <SelectValue placeholder={t('crm.type', 'Type')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
          <SelectItem value="all" className="text-foreground focus:bg-muted/60"><DotLabel tone="muted">{t('crm.allTypes', 'All types')}</DotLabel></SelectItem>
          <SelectItem value="private" className="text-foreground focus:bg-muted/60"><DotLabel tone="blue">{t('crm.typePrivate', 'Private')}</DotLabel></SelectItem>
          <SelectItem value="business" className="text-foreground focus:bg-muted/60"><DotLabel tone="emerald">{t('crm.typeBusiness', 'Business')}</DotLabel></SelectItem>
          <SelectItem value="partner" className="text-foreground focus:bg-muted/60"><DotLabel tone="violet">{t('crm.typePartner', 'Partner')}</DotLabel></SelectItem>
          <SelectItem value="supplier" className="text-foreground focus:bg-muted/60"><DotLabel tone="amber">{t('crm.typeSupplier', 'Lieferant')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      <Select value={cantonFilter} onValueChange={onCantonFilterChange}>
        <SelectTrigger className={cn(baseTriggerCls, cantonFilter !== 'all' && activeTriggerCls, 'w-[150px]')}>
          <SelectValue placeholder={t('crm.canton', 'Canton')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="max-h-72 bg-card border-border">
          <SelectItem value="all" className="text-foreground focus:bg-muted/60">{t('crm.allCantons', 'All cantons')}</SelectItem>
          {CH_CANTONS.map((c) => (
            <SelectItem key={c.code} value={c.code} className="text-foreground focus:bg-muted/60">
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                {c.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={newsletterFilter} onValueChange={onNewsletterFilterChange}>
        <SelectTrigger className={cn(baseTriggerCls, newsletterFilter !== 'all' && activeTriggerCls, 'w-[150px]')}>
          <SelectValue placeholder={t('crm.newsletter', 'Newsletter')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
          <SelectItem value="all" className="text-foreground focus:bg-muted/60"><DotLabel tone="muted">{t('crm.allNewsletter', 'All')}</DotLabel></SelectItem>
          <SelectItem value="optin" className="text-foreground focus:bg-muted/60"><DotLabel tone="amber">{t('crm.optedIn', 'Opted in')}</DotLabel></SelectItem>
          <SelectItem value="optout" className="text-foreground focus:bg-muted/60"><DotLabel tone="slate">{t('crm.optedOut', 'Opted out')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      <Select value={salesFilter} onValueChange={onSalesFilterChange}>
        <SelectTrigger className={cn(baseTriggerCls, salesFilter !== 'all' && activeTriggerCls, 'w-[180px]')}>
          <SelectValue placeholder={t('crm.salesStatus', 'Vertriebsstatus')} />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
          <SelectItem value="all" className="text-foreground focus:bg-muted/60"><DotLabel tone="muted">{t('crm.allSalesStatus', 'Alle Vertriebsstatus')}</DotLabel></SelectItem>
          <SelectItem value="offer_received" className="text-foreground focus:bg-muted/60"><DotLabel tone="amber">{t('crm.salesOfferReceived', 'Nur Offerte erhalten')}</DotLabel></SelectItem>
          <SelectItem value="zusage" className="text-foreground focus:bg-muted/60"><DotLabel tone="emerald">{t('crm.salesZusage', 'Zusage')}</DotLabel></SelectItem>
          <SelectItem value="absage" className="text-foreground focus:bg-muted/60"><DotLabel tone="rose">{t('crm.salesAbsage', 'Absage')}</DotLabel></SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <>
          <div className="w-px h-5 bg-muted/70" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px] text-muted-foreground gap-1 rounded-full hover:text-red-400 hover:bg-red-500/10"
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
