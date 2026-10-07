'use client';

import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, ChevronDown, Loader2, LocateFixed, MapPinOff, Search, SearchX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lead } from '../../types/lead-types';
import { Button, useLanguage } from '../lead-ui-kit';
import { LeadMapListItem } from './lead-map-list-item';
import type { LeadUser } from '../lead-ui-utils';

type LeadMapSidebarProps = {
  located: Lead[];
  unlocated: Lead[];
  users: LeadUser[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  activeId: string | null;
  hoveredId: string | null;
  selectedIds: Record<string, boolean>;
  selectable: boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onActivateLocated: (lead: Lead) => void;
  onActivateUnlocated: (lead: Lead) => void;
  onHover: (id: string | null) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  total: number;
  shown: number;
  canGeocode: boolean;
  geocodingIds: Record<string, boolean>;
  geocodingAll: boolean;
  geocodeProgress: { done: number; total: number } | null;
  onGeocodeOne: (lead: Lead) => void;
  onGeocodeAll: () => void;
};

function ListSkeleton() {
  return (
    <div className="space-y-2 p-3" aria-busy="true">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-[72px] rounded-xl bg-muted/40" />
      ))}
    </div>
  );
}

export function LeadMapSidebar({
  located,
  unlocated,
  users,
  isLoading,
  isError,
  onRetry,
  search,
  onSearchChange,
  activeId,
  hoveredId,
  selectedIds,
  selectable,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleSelectAll,
  onActivateLocated,
  onActivateUnlocated,
  onHover,
  hasActiveFilters,
  onClearFilters,
  total,
  shown,
  canGeocode,
  geocodingIds,
  geocodingAll,
  geocodeProgress,
  onGeocodeOne,
  onGeocodeAll,
}: LeadMapSidebarProps) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showUnlocated, setShowUnlocated] = useState(false);

  const virtualizer = useVirtualizer({
    count: located.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 84,
    overscan: 10,
  });

  // Keep the active lead visible in the list (e.g. after a marker click).
  useEffect(() => {
    if (!activeId) return;
    const index = located.findIndex((lead) => lead.id === activeId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [activeId, located, virtualizer]);

  const isEmpty = !isLoading && !isError && located.length === 0 && unlocated.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Search + count */}
      <div className="shrink-0 space-y-2.5 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            maxLength={100}
            placeholder={t('leads.map.searchPlaceholder', 'Search leads on the map…')}
            aria-label={t('leads.search.label', 'Search leads')}
            className="h-10 w-full rounded-xl border border-border bg-background pe-9 ps-9 text-[13px] text-foreground shadow-sm transition-all placeholder:text-muted-foreground/60 hover:border-primary/25 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label={t('leads.filter.clearSearch', 'Clear search')}
              className="absolute end-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 px-0.5">
          {selectable && (located.length > 0 || unlocated.length > 0) ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && someSelected;
                }}
                onChange={onToggleSelectAll}
                aria-label={t('leads.map.selectAllVisible', 'Select all visible leads')}
                className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-2 focus:ring-primary/30"
              />
              {t('leads.map.selectAll', 'Select all')}
            </label>
          ) : (
            <span />
          )}
          <span className="text-[11px] font-medium text-muted-foreground" aria-live="polite">
            {t('leads.map.showingCount', 'Showing {shown} of {total}', { shown, total })}
          </span>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">{t('leads.map.error.title', 'Unable to load leads on the map')}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
            <SearchX className="h-6 w-6 text-primary/50" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-foreground">{t('leads.map.empty.title', 'No leads match your current filters.')}</p>
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {t('leads.map.clearFilters', 'Clear filters')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
          {/* Located leads (virtualized) */}
          {located.length > 0 ? (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((row) => {
                const lead = located[row.index];
                if (!lead) return null;
                return (
                  <div
                    key={lead.id}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, insetInlineStart: 0, width: '100%', transform: `translateY(${row.start}px)` }}
                    className="pb-1.5"
                  >
                    <LeadMapListItem
                      lead={lead}
                      users={users}
                      selected={Boolean(selectedIds[lead.id])}
                      active={activeId === lead.id}
                      hovered={hoveredId === lead.id}
                      located
                      selectable={selectable}
                      onToggleSelect={onToggleSelect}
                      onActivate={onActivateLocated}
                      onHover={onHover}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Location unavailable */}
          {unlocated.length > 0 ? (
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center gap-1.5 px-1">
                <button
                  type="button"
                  onClick={() => setShowUnlocated((v) => !v)}
                  aria-expanded={showUnlocated}
                  className="flex flex-1 items-center gap-2 rounded-lg px-1.5 py-2 text-start text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  <MapPinOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>{t('leads.map.unavailableSection', 'Location unavailable')}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{unlocated.length}</span>
                  <ChevronDown className={cn('ms-auto h-4 w-4 transition-transform', showUnlocated && 'rotate-180')} aria-hidden="true" />
                </button>
              </div>

              {canGeocode ? (
                <div className="px-1.5 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full gap-1.5 text-[11px]"
                    disabled={geocodingAll}
                    onClick={onGeocodeAll}
                  >
                    {geocodingAll ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        {geocodeProgress
                          ? t('leads.map.geocode.progress', 'Geocoding… {done}/{total}', {
                              done: geocodeProgress.done,
                              total: geocodeProgress.total,
                            })
                          : t('leads.map.geocode.working', 'Geocoding…')}
                      </>
                    ) : (
                      <>
                        <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('leads.map.geocode.all', 'Geocode all from address')}
                      </>
                    )}
                  </Button>
                </div>
              ) : null}

              {showUnlocated ? (
                <div className="space-y-1.5 pt-1">
                  {unlocated.map((lead) => (
                    <LeadMapListItem
                      key={lead.id}
                      lead={lead}
                      users={users}
                      selected={Boolean(selectedIds[lead.id])}
                      active={activeId === lead.id}
                      hovered={hoveredId === lead.id}
                      located={false}
                      selectable={selectable}
                      onToggleSelect={onToggleSelect}
                      onActivate={onActivateUnlocated}
                      onHover={onHover}
                      canGeocode={canGeocode}
                      geocoding={Boolean(geocodingIds[lead.id])}
                      onGeocode={onGeocodeOne}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
