'use client';

// Results workspace: summary header, map/list view toggle, the (store-backed)
// filter panel, a sort control, the virtualized business list and the floating
// bulk bar. Map ↔ list stay in sync through the store (selected / hovered /
// viewport). The map is read-only here (no area drawing).

import { useMemo, useState } from 'react';
import { Filter, List, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DiscoveryMap } from '../ui/discovery-map';
import type { DiscoveryResult, DiscoverySession } from '../types/discovery-types';
import {
  useLeadGenFilters,
  useLeadGenMapSync,
  useLeadGenRowSelection,
  useLeadGenStore,
  useLeadGenWizard,
  useSelectedResultIds,
} from '../state/lead-gen-store';
import { BusinessList } from './business-list';
import { BulkActionBar } from './bulk-action-bar';
import { FilterPanel } from '../components/filter-panel';

const DEFAULT_CENTER = { lat: 47.3769, lng: 8.5417 };
const MAX_MARKERS = 500;

const SORT_OPTIONS: Array<{ id: string; sortBy: string; sortOrder: 'asc' | 'desc'; labelKey: string; fallback: string }> = [
  { id: 'relevance', sortBy: 'discoveredAt', sortOrder: 'desc', labelKey: 'leadgen.results.sort.relevance', fallback: 'Relevance' },
  { id: 'rating', sortBy: 'rating', sortOrder: 'desc', labelKey: 'leadgen.results.sort.rating', fallback: 'Rating' },
  { id: 'reviews', sortBy: 'reviewCount', sortOrder: 'desc', labelKey: 'leadgen.results.sort.reviews', fallback: 'Reviews' },
  { id: 'name', sortBy: 'name', sortOrder: 'asc', labelKey: 'leadgen.results.sort.name', fallback: 'Name' },
];

export type ResultsPanelProps = {
  sessionId: string;
  session?: DiscoverySession;
  results: DiscoveryResult[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onFetchNextPage?: () => void;
  onOpenResult: (result: DiscoveryResult) => void;
  onAddLead: (result: DiscoveryResult) => void;
  addingId?: string | null;
  onAddAllNew: () => void;
  onAddSelected: () => void;
  onNewSearch: () => void;
};

export function ResultsPanel({
  session,
  results,
  isLoading,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onOpenResult,
  onAddLead,
  addingId,
  onAddAllNew,
  onAddSelected,
  onNewSearch,
}: ResultsPanelProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<'map' | 'list'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { areaDraft } = useLeadGenWizard();
  const { filters, sort, setSort } = useLeadGenFilters();
  const {
    selectedResultId,
    hoveredResultId,
    mapViewport,
    setSelectedResultId,
    setHoveredResultId,
    setMapViewport,
  } = useLeadGenMapSync();
  const rowSelection = useLeadGenRowSelection();
  const selectedIds = useSelectedResultIds();
  const setRowSelection = useLeadGenStore((state) => state.setRowSelection);
  const toggleRow = useLeadGenStore((state) => state.toggleRow);
  const clearSelection = useLeadGenStore((state) => state.clearSelection);

  const counts = session?.counts;
  const total = counts?.discovered ?? results.length;
  const newCount = counts?.new ?? results.filter((r) => r.crmStatus === 'NEW' && r.importStatus === 'NOT_IMPORTED').length;
  const existingCount = counts?.existing ?? results.filter((r) => r.crmStatus === 'EXISTING').length;

  const mapResults = useMemo(
    () =>
      results
        .filter((result) => result.business.location)
        .slice(0, MAX_MARKERS)
        .map((result) => ({
          id: result.id,
          lat: result.business.location!.lat,
          lng: result.business.location!.lng,
          status: result.crmStatus,
        })),
    [results],
  );

  const mapCenter = mapViewport.center ?? results.find((r) => r.business.location)?.business.location ?? DEFAULT_CENTER;

  const openFromMarker = (id: string) => {
    const result = results.find((item) => item.id === id);
    setSelectedResultId(id);
    if (result) onOpenResult(result);
  };

  const selectAllNew = (checked: boolean) => {
    if (!checked) {
      clearSelection();
      return;
    }
    const next: Record<string, boolean> = {};
    for (const result of results) {
      if (result.crmStatus === 'NEW' && result.importStatus === 'NOT_IMPORTED') next[result.id] = true;
    }
    setRowSelection(next);
  };

  const emptyVariant =
    filters.crmStatus !== 'ALL' || filters.minRating > 0 || filters.hasPhone || filters.hasWebsite || filters.search
      ? 'noResults'
      : existingCount > 0 && newCount === 0
        ? 'allInCrm'
        : 'noBusinesses';

  const activeSort = SORT_OPTIONS.find((option) => option.sortBy === sort.sortBy) ?? SORT_OPTIONS[0];
  const allNewSelected = newCount > 0 && selectedIds.length >= newCount;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{t('leadgen.results.title', 'Results')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('leadgen.results.summary', '{total} businesses · {new} new · {existing} in CRM', {
                total,
                new: newCount,
                existing: existingCount,
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div role="group" aria-label={t('leadgen.results.view.map', 'View')} className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 lg:hidden">
              {([
                { mode: 'list', icon: List, label: t('leadgen.results.view.list', 'List') },
                { mode: 'map', icon: MapIcon, label: t('leadgen.results.view.map', 'Map') },
              ] as const).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  aria-label={label}
                  title={label}
                  onClick={() => setView(mode)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    view === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>

            <Button
              variant={filtersOpen ? 'secondary' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leadgen.results.filters', 'Filters')}
            </Button>

            <Button variant="outline" size="sm" className="gap-1.5" onClick={onNewSearch}>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leadgen.import.summary.newSearch', 'New search')}
            </Button>

            {newCount > 0 && (
              <Button size="sm" className="gap-1.5" onClick={onAddAllNew}>
                {`${t('leadgen.bulk.addAllNew', 'Add all new')} (${newCount})`}
              </Button>
            )}
          </div>
        </div>
      </header>

      {filtersOpen && (
        <div className="shrink-0 border-b border-border bg-card px-4 py-3">
          <FilterPanel onApply={() => setFiltersOpen(false)} />
        </div>
      )}

      {/* Map + list split */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={cn('relative min-h-[280px] flex-1', view === 'map' ? 'flex' : 'hidden lg:flex')}>
          <DiscoveryMap
            center={mapCenter}
            zoom={mapViewport.zoom}
            area={areaDraft}
            drawingMode={null}
            results={mapResults}
            selectedResultId={selectedResultId}
            hoveredResultId={hoveredResultId}
            onMarkerClick={openFromMarker}
            onMarkerHover={setHoveredResultId}
            onViewportChange={(viewport) => setMapViewport({ center: viewport.center, zoom: viewport.zoom })}
            className="h-full w-full"
          />
        </div>

        <div
          className={cn(
            'flex min-h-0 w-full flex-col border-t border-border lg:w-[440px] lg:border-s lg:border-t-0',
            view === 'list' ? 'flex' : 'hidden lg:flex',
          )}
        >
          {/* List toolbar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allNewSelected}
                onCheckedChange={(checked) => selectAllNew(checked === true)}
                aria-label={t('leadgen.bulk.selectNew', 'Select all new')}
                disabled={newCount === 0}
              />
              {t('leadgen.bulk.selectNew', 'Select all new')}
            </label>
            <span className="ms-auto text-xs text-muted-foreground">
              {t('leadgen.results.count', '{count} results', { count: results.length })}
            </span>
            <Select
              value={activeSort.id}
              onValueChange={(id) => {
                const option = SORT_OPTIONS.find((item) => item.id === id);
                if (option) setSort({ sortBy: option.sortBy, sortOrder: option.sortOrder });
              }}
            >
              <SelectTrigger className="h-7 w-auto gap-1 text-xs" aria-label={t('leadgen.results.sort', 'Sort')}>
                <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {t(option.labelKey, option.fallback)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-h-0 flex-1">
            <BusinessList
              results={results}
              selectedResultId={selectedResultId}
              hoveredResultId={hoveredResultId}
              rowSelection={rowSelection}
              onToggleRow={toggleRow}
              onOpen={onOpenResult}
              onHover={setHoveredResultId}
              onAddLead={onAddLead}
              addingId={addingId}
              isLoading={isLoading}
              isError={isError}
              onRetry={onRetry}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onFetchNextPage={onFetchNextPage}
              emptyVariant={emptyVariant}
            />
          </div>
        </div>
      </div>

      <BulkActionBar
        selectedCount={selectedIds.length}
        newCount={newCount}
        onAddSelected={onAddSelected}
        onAddAllNew={onAddAllNew}
        onClear={clearSelection}
      />
    </div>
  );
}
