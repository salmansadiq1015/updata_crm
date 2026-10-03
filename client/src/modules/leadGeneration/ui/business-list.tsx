'use client';

// Virtualised result cards. Mirrors tasks' `task-list-view` virtualisation
// (useVirtualizer + measureElement + fetch-next-near-end). Pure presentational:
// selection, hover and open are driven by the parent through callbacks so the
// same list is trivially testable.

import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Loader2, MapPin, Plus, SearchX, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { DiscoveryResult } from '../types/discovery-types';
import {
  CrmStatusBadge,
  ImportedBadge,
  businessInitials,
  getPriceLevelLabel,
  isImported,
} from './result-ui';

type Translate = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;

type BusinessCardProps = {
  result: DiscoveryResult;
  selected: boolean;
  highlighted: boolean;
  checked: boolean;
  onToggleRow: (id: string) => void;
  onOpen: (result: DiscoveryResult) => void;
  onHover: (id: string | null) => void;
  onAddLead: (result: DiscoveryResult) => void;
  isAdding: boolean;
  t: Translate;
};

const BusinessCard = memo(function BusinessCard({
  result,
  selected,
  highlighted,
  checked,
  onToggleRow,
  onOpen,
  onHover,
  onAddLead,
  isAdding,
  t,
}: BusinessCardProps) {
  const { business } = result;
  const imported = isImported(result.importStatus);
  const priceLabel = getPriceLevelLabel(t, business.priceLevel);
  const typeLabel = business.type ?? business.primaryType;

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onOpen(result)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(result);
        }
      }}
      onMouseEnter={() => onHover(result.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group flex cursor-pointer items-start gap-3 border-b border-border px-3 py-3 outline-none transition-colors',
        'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-primary/5',
        highlighted && !selected && 'bg-muted/50',
      )}
    >
      <div className="flex items-center pt-0.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggleRow(result.id)}
          aria-label={t('leadgen.bulk.selectOne', 'Select {name}', { name: business.name })}
        />
      </div>

      {/* Thumbnail / initials */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15">
        {businessInitials(business.name)}
      </div>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {business.name}
          </p>
          <CrmStatusBadge status={result.crmStatus} t={t} className="shrink-0" />
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {business.rating != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-medium text-foreground">{business.rating.toFixed(1)}</span>
              {business.reviewCount != null && <span>({business.reviewCount})</span>}
            </span>
          )}
          {typeLabel && <span className="truncate">{typeLabel}</span>}
          {priceLabel && <span>{priceLabel}</span>}
        </div>

        {business.address.formatted && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{business.address.formatted}</span>
          </p>
        )}
      </div>

      {/* Add */}
      <div className="flex shrink-0 items-center pt-0.5" onClick={(event) => event.stopPropagation()}>
        {imported ? (
          <ImportedBadge t={t} />
        ) : (
          <Button
            size="xs"
            variant="outline"
            className="gap-1"
            disabled={isAdding}
            onClick={() => onAddLead(result)}
          >
            {isAdding ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
            {t('leadgen.bulk.addOne', 'Add')}
          </Button>
        )}
      </div>
    </div>
  );
});

export type BusinessListProps = {
  results: DiscoveryResult[];
  selectedResultId: string | null;
  hoveredResultId: string | null;
  rowSelection: Record<string, boolean>;
  onToggleRow: (id: string) => void;
  onOpen: (result: DiscoveryResult) => void;
  onHover: (id: string | null) => void;
  onAddLead: (result: DiscoveryResult) => void;
  addingId?: string | null;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onFetchNextPage?: () => void;
  emptyVariant?: 'noResults' | 'allInCrm' | 'noBusinesses';
};

export function BusinessList({
  results,
  selectedResultId,
  hoveredResultId,
  rowSelection,
  onToggleRow,
  onOpen,
  onHover,
  onAddLead,
  addingId,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  emptyVariant = 'noResults',
}: BusinessListProps) {
  const { t } = useLanguage();
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (
      lastItem &&
      hasNextPage &&
      !isFetchingNextPage &&
      onFetchNextPage &&
      lastItem.index >= results.length - 6
    ) {
      onFetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, lastItem, onFetchNextPage, results.length]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
            <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-shimmer h-4 w-2/3 rounded bg-muted" />
              <div className="skeleton-shimmer h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{t('leadgen.error.generic.title', 'Something went wrong')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t('leadgen.error.generic.body', 'Please try again.')}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('leadgen.error.retry', 'Retry')}
          </Button>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    const titleKey = `leadgen.empty.${emptyVariant}.title`;
    const bodyKey = `leadgen.empty.${emptyVariant}.body`;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-foreground">{t(titleKey, 'No businesses found')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t(bodyKey, 'Try widening the area or choosing more categories.')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full min-h-0 overflow-auto scrollbar-thin"
      role="list"
      aria-label={t('leadgen.results.title', 'Results')}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const result = results[virtualRow.index];
          if (!result) return null;
          return (
            <div
              key={result.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              <BusinessCard
                result={result}
                selected={selectedResultId === result.id}
                highlighted={hoveredResultId === result.id}
                checked={Boolean(rowSelection[result.id])}
                onToggleRow={onToggleRow}
                onOpen={onOpen}
                onHover={onHover}
                onAddLead={onAddLead}
                isAdding={addingId === result.id}
                t={t}
              />
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t('leadgen.results.loadingMore', 'Loading more…')}
        </div>
      )}
    </div>
  );
}
