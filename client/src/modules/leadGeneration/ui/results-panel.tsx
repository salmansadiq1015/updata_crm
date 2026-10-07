'use client';

// Results workspace: summary header, map/list view toggle, the (store-backed)
// filter panel, a sort control, the virtualized business list and the floating
// bulk bar. Map ↔ list stay in sync through the store (selected / hovered /
// viewport). The map is read-only here (no area drawing).

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  List,
  Map as MapIcon,
  MapPin,
  Radar,
  Search,
  SlidersHorizontal,
  Tags,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DiscoveryMap } from '../ui/discovery-map';
import type { DiscoveryMarker, DiscoveryResult, DiscoverySession } from '../types/discovery-types';
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
import { ResultPagination } from './result-pagination';
import { FilterPanel } from '../components/filter-panel';

const DEFAULT_CENTER = { lat: 47.3769, lng: 8.5417 };
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
  markers?: DiscoveryMarker[];
  isLoading?: boolean;
  isError?: boolean;
  errorStatusCode?: number;
  onRetry?: () => void;
  pageSize: number;
  filteredTotal: number;
  loadedCount: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  onLoadMore: () => void;
  onPageSizeChange: (pageSize: number) => void;
  markersLoading?: boolean;
  markersError?: boolean;
  onRetryMarkers?: () => void;
  onOpenResult: (result: DiscoveryResult) => void;
  onOpenResultId?: (id: string) => void;
  onAddLead: (result: DiscoveryResult) => void;
  addingId?: string | null;
  onAddAllNew: () => void;
  onAddSelected: () => void;
  onNewSearch: () => void;
};

export function ResultsPanel({
  session,
  results,
  markers = [],
  isLoading,
  isError,
  errorStatusCode,
  onRetry,
  pageSize,
  filteredTotal,
  loadedCount,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onLoadMore,
  onPageSizeChange,
  markersLoading,
  markersError,
  onRetryMarkers,
  onOpenResult,
  onOpenResultId,
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
  const total = counts?.discovered ?? filteredTotal;
  const newCount = counts?.new ?? results.filter((r) => r.crmStatus === 'NEW' && r.importStatus === 'NOT_IMPORTED').length;
  const existingCount = counts?.existing ?? results.filter((r) => r.crmStatus === 'EXISTING').length;
  const possibleDuplicateCount = counts?.possibleDuplicates
    ?? results.filter((r) => r.crmStatus === 'POSSIBLE_DUPLICATE').length;
  const failedCount = counts?.failed ?? results.filter((r) => r.importStatus === 'FAILED').length;

  const mapResults = useMemo(
    () =>
      markers.length
        ? markers.map((marker) => ({
            ...marker,
            status: marker.status ?? 'NEW',
          }))
        : results
          .filter((result) => result.business.location)
          .map((result) => ({
            id: result.id,
            lat: result.business.location!.lat,
            lng: result.business.location!.lng,
            status: result.crmStatus,
          })),
    [markers, results],
  );

  const mapCenter = mapViewport.center ?? results.find((r) => r.business.location)?.business.location ?? DEFAULT_CENTER;

  const openFromMarker = (id: string) => {
    const result = results.find((item) => item.id === id);
    setSelectedResultId(id);
    if (result) onOpenResult(result);
    else onOpenResultId?.(id);
  };

  const selectablePageIds = results
    .filter((result) => result.crmStatus === 'NEW' && result.importStatus === 'NOT_IMPORTED')
    .map((result) => result.id);

  const selectAllNew = (checked: boolean) => {
    if (!checked) {
      const next = { ...rowSelection };
      for (const id of selectablePageIds) delete next[id];
      setRowSelection(next);
      return;
    }
    const next: Record<string, boolean> = { ...rowSelection };
    for (const id of selectablePageIds) next[id] = true;
    setRowSelection(next);
  };

  const emptyVariant =
    filters.crmStatus !== 'ALL' || filters.minRating > 0 || filters.hasPhone || filters.hasWebsite || filters.search
      ? 'noResults'
      : existingCount > 0 && newCount === 0
        ? 'allInCrm'
        : 'noBusinesses';

  const activeSort = SORT_OPTIONS.find((option) => option.sortBy === sort.sortBy) ?? SORT_OPTIONS[0];
  const allNewSelected = selectablePageIds.length > 0 && selectablePageIds.every((id) => rowSelection[id]);
  const coverageState = session?.coverage.state ?? 'PENDING';
  const coveragePartial = coverageState === 'PARTIAL';
  const coverageExhausted = coverageState === 'EXHAUSTED';
  const analysisFailed = session?.status === 'FAILED';
  const analysisCancelled = session?.status === 'CANCELLED';
  const locationLabel = session?.location.formattedAddress
    ?? session?.location.city
    ?? session?.location.name
    ?? null;
  const areaLabel = session?.area.radiusMeters
    ? `${(session.area.radiusMeters / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km radius`
    : session?.area.type
      ? session.area.type.charAt(0).toUpperCase() + session.area.type.slice(1)
      : null;
  const typeLabel = session?.businessTypes.map((item) => item.name ?? item.id).filter(Boolean).join(', ') || null;

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
            <p className="text-[11px] text-muted-foreground">
              {t('leadgen.results.duplicatesSummary', '{count} possible duplicates', { count: possibleDuplicateCount })}
              {' · '}
              {coveragePartial
                ? t('leadgen.results.incomplete', 'Coverage incomplete')
                : analysisFailed
                  ? t('leadgen.results.failed', 'Analysis failed')
                  : analysisCancelled
                    ? t('leadgen.results.cancelled', 'Analysis cancelled')
                    : coverageExhausted
                      ? t('leadgen.results.complete', 'Provider search exhausted')
                      : t('leadgen.results.searching', 'Search still running')}
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
              {t(
                'leadgen.results.countsLine',
                'Discovered: {discovered} · Loaded: {loaded} · Duplicates: {duplicates} · Failed: {failed}',
                {
                  discovered: total,
                  loaded: Math.min(loadedCount, total || loadedCount),
                  duplicates: possibleDuplicateCount,
                  failed: failedCount,
                },
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {locationLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-foreground">
                  <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
                  {locationLabel}
                </span>
              )}
              {areaLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-foreground">
                  <Radar className="h-3 w-3 text-primary" aria-hidden="true" />
                  {areaLabel}
                </span>
              )}
              {typeLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-foreground">
                  <Tags className="h-3 w-3 text-primary" aria-hidden="true" />
                  {typeLabel}
                </span>
              )}
              {session?.keyword && (
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[10px] font-medium text-foreground">
                  “{session.keyword}”
                </span>
              )}
            </div>
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

      {(analysisFailed || analysisCancelled || coveragePartial || coverageExhausted) && (
        <div
          role="status"
          className={cn(
            'flex shrink-0 items-start gap-2 border-b px-4 py-2.5 text-xs',
            analysisFailed
              ? 'border-destructive/25 bg-destructive/8 text-destructive'
              : analysisCancelled || coveragePartial
              ? 'border-amber-500/20 bg-amber-500/8 text-amber-950 dark:text-amber-100'
              : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-950 dark:text-emerald-100',
          )}
        >
          {analysisFailed || analysisCancelled || coveragePartial
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
          <div>
            <p className="font-semibold">
              {analysisFailed
                ? t('leadgen.results.failedTitle', 'Analysis stopped before completion')
                : analysisCancelled
                  ? t('leadgen.results.cancelledTitle', 'Analysis cancelled')
                  : coveragePartial
                ? t('leadgen.results.coveragePartialTitle', 'Some search regions could not be exhausted')
                : t('leadgen.results.coverageExhaustedTitle', 'Every planned region was searched to provider exhaustion')}
            </p>
            <p className="mt-0.5 opacity-80">
              {analysisFailed
                ? session?.error?.message ?? t('leadgen.results.failedBody', 'Start a new search or try a smaller area.')
                : analysisCancelled
                  ? t('leadgen.results.cancelledBody', 'Start a new search when you are ready.')
                  : coveragePartial
                ? t(
                    'leadgen.results.coveragePartialBody',
                    '{unresolved} unresolved regions after {searches} provider requests. Results are shown, but are not presented as complete.',
                    {
                      unresolved: session?.coverage.unresolvedRegions ?? session?.progress.errors ?? 0,
                      searches: session?.usage.searchRequests ?? 0,
                    },
                  )
                : t(
                    'leadgen.results.coverageExhaustedBody',
                    '{searches} provider requests searched the selected area with adaptive overlapping cells. Google may still omit uncategorized or unavailable listings.',
                    { searches: session?.usage.searchRequests ?? 0 },
                  )}
            </p>
          </div>
        </div>
      )}

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
          {(markersLoading || markersError) && (
            <div className="absolute start-3 top-3 z-[500] flex items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
              {markersError ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                  <span>{t('leadgen.markers.partial', 'Some map markers could not be loaded.')}</span>
                  {onRetryMarkers && (
                    <Button variant="ghost" size="xs" onClick={onRetryMarkers}>
                      {t('common.retry', 'Retry')}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Radar className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden="true" />
                  <span>{t('leadgen.markers.loading', 'Loading complete map…')}</span>
                </>
              )}
            </div>
          )}
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
                aria-label={t('leadgen.bulk.selectPage', 'Select this page')}
                disabled={selectablePageIds.length === 0}
              />
              {t('leadgen.bulk.selectPage', 'Select page')}
            </label>
            <span className="ms-auto text-xs text-muted-foreground">
              {t('leadgen.results.count', '{count} results', { count: filteredTotal })}
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
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={onLoadMore}
              isLoading={isLoading}
              isError={isError}
              errorStatusCode={errorStatusCode}
              onRetry={onRetry}
              emptyVariant={emptyVariant}
            />
          </div>
          <ResultPagination
            pageSize={pageSize}
            total={filteredTotal}
            loadedCount={loadedCount}
            hasNextPage={hasNextPage}
            isFetching={isFetchingNextPage}
            isError={isFetchNextPageError}
            onLoadMore={onLoadMore}
            onPageSizeChange={onPageSizeChange}
            onRetry={onLoadMore}
          />
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
