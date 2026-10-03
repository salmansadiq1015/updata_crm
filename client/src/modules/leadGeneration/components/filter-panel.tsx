'use client';

// Results filter panel. Every control here maps to a field the discovery
// results query actually understands (crmStatus / minRating / hasPhone /
// hasWebsite / search), so no filter is a no-op. Writes to the store, which the
// workspace feeds straight into `useDiscoveryResults`.

import { Phone, Globe, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { MatchingStatus } from '../types/discovery-types';
import { useLeadGenFilters } from '../state/lead-gen-store';

type CrmFilterValue = MatchingStatus | 'ALL';

const RATING_OPTIONS = [
  { value: 0, labelKey: 'leadgen.results.filter.all', fallback: 'Any' },
  { value: 4, label: '4.0+' },
  { value: 4.5, label: '4.5+' },
] as const;

const STATUS_OPTIONS: Array<{ value: CrmFilterValue; labelKey: string; fallback: string }> = [
  { value: 'ALL', labelKey: 'leadgen.results.filter.all', fallback: 'All' },
  { value: 'NEW', labelKey: 'leadgen.badge.new', fallback: 'New' },
  { value: 'EXISTING', labelKey: 'leadgen.badge.existing', fallback: 'Already in CRM' },
  { value: 'POSSIBLE_DUPLICATE', labelKey: 'leadgen.badge.possibleDuplicate', fallback: 'Possible duplicate' },
];

function Segmented({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function FilterPanel({ onApply }: { onApply?: () => void }) {
  const { t } = useLanguage();
  const { filters, setFilters, clearFilters } = useLeadGenFilters();

  return (
    <div className="space-y-4">
      <Segmented label={t('leadgen.results.filter.status', 'Status')}>
        {STATUS_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={filters.crmStatus === option.value}
            onClick={() => setFilters({ crmStatus: option.value })}
          >
            {t(option.labelKey, option.fallback)}
          </Pill>
        ))}
      </Segmented>

      <Segmented label={t('leadgen.results.filter.rating', 'Rating')}>
        {RATING_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={filters.minRating === option.value}
            onClick={() => setFilters({ minRating: option.value })}
          >
            {option.value > 0 && <Star className="h-3 w-3 fill-current" aria-hidden="true" />}
            {'label' in option ? option.label : t(option.labelKey, option.fallback)}
          </Pill>
        ))}
      </Segmented>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('leadgen.results.filters', 'Details')}</p>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Checkbox
            checked={filters.hasPhone}
            onCheckedChange={(checked) => setFilters({ hasPhone: checked === true })}
            aria-label={t('leadgen.results.filter.hasPhone', 'Has phone')}
          />
          <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>{t('leadgen.results.filter.hasPhone', 'Has phone')}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <Checkbox
            checked={filters.hasWebsite}
            onCheckedChange={(checked) => setFilters({ hasWebsite: checked === true })}
            aria-label={t('leadgen.results.filter.hasWebsite', 'Has website')}
          />
          <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span>{t('leadgen.results.filter.hasWebsite', 'Has website')}</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="leadgen-filter-keywords" className="text-xs font-medium text-muted-foreground">
          {t('leadgen.results.filter.keywords', 'Keywords')}
        </label>
        <Input
          id="leadgen-filter-keywords"
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder={t('leadgen.results.filter.keywordsPlaceholder', 'Filter by name or address')}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.results.filter.clear', 'Clear')}
        </Button>
        {onApply && (
          <Button size="sm" onClick={onApply}>
            {t('leadgen.results.filter.apply', 'Apply')}
          </Button>
        )}
      </div>
    </div>
  );
}
