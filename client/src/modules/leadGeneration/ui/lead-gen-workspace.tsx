'use client';

// Orchestrator for the Lead Generation / Business Discovery workspace.
//
// Flow (store-driven wizard step 0..3 + a derived analyze/results phase):
//   Location (0) → Business type (1) → Review (2) → [Start analysis] →
//   Analyzing (progress) → Results (map + list) → Add to CRM (import) (3).
//
// Server state = TanStack Query (foundation hooks); UI state = the lead-gen
// store; the open result = the `?detail=` URL param. Realtime merges live
// progress/results into the cache, with `useDiscoverySession({poll:true})` as a
// socket-less fallback.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, History, Loader2, Radar, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useDrawer } from '@/shared/hooks/use-drawer';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DiscoveryMap } from '../ui/discovery-map';
import type { DiscoveryDrawingMode } from '../ui/map/types';
import {
  DISCOVERY_PAGE_SIZE,
  isActiveSession,
  useCancelDiscovery,
  useCreateDiscovery,
  useDiscoveryResults,
  useDiscoveryMarkers,
  useDiscoverySession,
  useFlattenedMarkers,
  useImportResult,
} from '../hooks/use-discovery';
import { useDiscoveryRealtime } from '../hooks/use-discovery-realtime';
import {
  useLeadGenFilters,
  useLeadGenMapSync,
  useLeadGenStore,
  useLeadGenWizard,
  useSelectedResultIds,
} from '../state/lead-gen-store';
import type { CreateDiscoveryInput, DiscoveryResult, DiscoverySession, ImportSelection } from '../types/discovery-types';
import { isAreaReady } from './geo-format';
import { LocationStep } from './wizard-steps/location-step';
import { BusinessTypeStep } from './wizard-steps/business-type-step';
import { ReviewStep } from './wizard-steps/review-step';
import { DiscoveryProgress } from './discovery-progress';
import { ResultsPanel } from './results-panel';
import { BusinessDetailDrawer } from './business-detail-drawer';
import { ImportPreviewDialog } from './import-preview-dialog';
import { SavedSearches } from './saved-searches';

const DEFAULT_CENTER = { lat: 47.3769, lng: 8.5417 };

const STEP_LABELS: Array<{ key: string; fallback: string }> = [
  { key: 'leadgen.wizard.step.location', fallback: 'Location' },
  { key: 'leadgen.wizard.step.businessType', fallback: 'Business type' },
  { key: 'leadgen.wizard.step.review', fallback: 'Review' },
  { key: 'leadgen.wizard.step.addToCrm', fallback: 'Add to CRM' },
];

function buildCreateInput(session: DiscoverySession): CreateDiscoveryInput | null {
  if (!session.area.type) return null;
  return {
    location: {
      ...(session.location.name ? { name: session.location.name } : {}),
      ...(session.location.mode ? { mode: session.location.mode } : {}),
      ...(session.location.center ? { center: session.location.center } : {}),
      ...(session.location.placeId ? { placeId: session.location.placeId } : {}),
      ...(session.location.countryCode ? { countryCode: session.location.countryCode } : {}),
      ...(session.location.country ? { country: session.location.country } : {}),
      ...(session.location.region ? { region: session.location.region } : {}),
      ...(session.location.city ? { city: session.location.city } : {}),
      ...(session.location.formattedAddress ? { formattedAddress: session.location.formattedAddress } : {}),
    },
    area: {
      type: session.area.type,
      ...(session.area.radiusMeters ? { radiusMeters: session.area.radiusMeters } : {}),
      ...(session.area.geometry ? { geometry: session.area.geometry } : {}),
      ...(session.area.bounds ? { bounds: session.area.bounds } : {}),
    },
    businessTypes: session.businessTypes.map((bt) => bt.id).filter(Boolean),
    ...(session.keyword ? { keyword: session.keyword } : {}),
  };
}

export function LeadGenWorkspace() {
  const { t } = useLanguage();
  const router = useRouter();

  const wizard = useLeadGenWizard();
  const {
    step,
    locationDraft,
    areaDraft,
    selectedBusinessTypes,
    keyword,
    nextStep,
    prevStep,
    setStep,
    setAreaDraft,
    setLocationDraft,
    setSelectedBusinessTypes,
    setKeyword,
    resetWizard,
  } = wizard;

  const mapSync = useLeadGenMapSync();
  const { filters, sort, clearFilters } = useLeadGenFilters();
  const selectedIds = useSelectedResultIds();
  const clearSelection = useLeadGenStore((state) => state.clearSelection);

  const drawer = useDrawer('detail');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pageSize, setPageSize] = useState(DISCOVERY_PAGE_SIZE);
  const [resultPagination, setResultPagination] = useState({ scopeKey: '', pageIndex: 0 });
  const [importDialog, setImportDialog] = useState<{ open: boolean; selection: ImportSelection }>({
    open: false,
    selection: { kind: 'ALL_NEW' },
  });

  const createDiscovery = useCreateDiscovery();
  const cancelDiscovery = useCancelDiscovery();
  const realtimeConnected = useDiscoveryRealtime(sessionId);
  // Socket events are primary. Poll only while the socket is unavailable.
  const sessionQuery = useDiscoverySession(sessionId, { poll: !realtimeConnected });
  const importResult = useImportResult(sessionId ?? '');
  const usersQuery = useWorkspaceUsers();

  // Results query params derived from store filters + sort (search debounced).
  const debouncedSearch = useDebounce(filters.search, 300);
  const resultParams = useMemo(
    () => ({
      limit: pageSize,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      ...(filters.crmStatus !== 'ALL' ? { crmStatus: filters.crmStatus } : {}),
      ...(filters.importStatus !== 'ALL' ? { importStatus: filters.importStatus } : {}),
      ...(filters.minRating > 0 ? { minRating: filters.minRating } : {}),
      ...(filters.hasPhone ? { hasPhone: true } : {}),
      ...(filters.hasWebsite ? { hasWebsite: true } : {}),
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    }),
    [filters, sort, debouncedSearch, pageSize],
  );
  const resultsQuery = useDiscoveryResults(sessionId, resultParams);
  const session = sessionQuery.data;
  const markerPagingEnabled = Boolean(session && !isActiveSession(session.status));
  const markersQuery = useDiscoveryMarkers(sessionId, { enabled: markerPagingEnabled });
  const markers = useFlattenedMarkers(markersQuery.data);
  const resultPages = resultsQuery.data?.pages ?? [];
  const resultScopeKey = `${sessionId ?? ''}:${JSON.stringify(resultParams)}`;
  const scopedPageIndex = resultPagination.scopeKey === resultScopeKey ? resultPagination.pageIndex : 0;
  const resultPageIndex = Math.min(scopedPageIndex, Math.max(0, resultPages.length - 1));
  const results = resultPages[resultPageIndex]?.data ?? [];
  const filteredTotal = resultPages[0]?.pagination.total
    ?? session?.counts.discovered
    ?? results.length;
  const setResultPageIndex = useCallback(
    (next: number | ((current: number) => number)) => {
      setResultPagination((current) => {
        const currentPage = current.scopeKey === resultScopeKey ? current.pageIndex : 0;
        const nextPage = typeof next === 'function' ? next(currentPage) : next;
        return { scopeKey: resultScopeKey, pageIndex: Math.max(0, nextPage) };
      });
    },
    [resultScopeKey],
  );

  const inResults = step === 3 && Boolean(sessionId);
  const hasResults = (session?.counts.discovered ?? 0) > 0 || results.length > 0;
  const showProgress = inResults && (!session || (isActiveSession(session.status) && !hasResults));
  const showResults = inResults && Boolean(session) && (hasResults || !isActiveSession(session!.status));

  // ── Map drawing-mode translation (store → map contract) ──────────────────────
  const mapDrawingMode: DiscoveryDrawingMode | null =
    mapSync.drawingMode === 'none'
      ? areaDraft.type === 'radius'
        ? 'radius'
        : null
      : mapSync.drawingMode;

  const handleAreaChange = useCallback(
    (area: typeof areaDraft) => {
      setAreaDraft(area);
      // A free-draw just completed — disarm the tool so it does not keep drawing.
      if (useLeadGenStore.getState().drawingMode !== 'none') {
        mapSync.setDrawingMode('none');
      }
    },
    [mapSync, setAreaDraft],
  );

  // ── Validation ───────────────────────────────────────────────────────────────
  const canLocation = Boolean(locationDraft.center) && isAreaReady(areaDraft);
  const canBusinessType = selectedBusinessTypes.length > 0;
  const canProceed = step === 0 ? canLocation : step === 1 ? canBusinessType : canLocation && canBusinessType;

  // ── Actions ──────────────────────────────────────────────────────────────────
  const startAnalysis = () => {
    if (!areaDraft.type || !canProceed) return;
    const input: CreateDiscoveryInput = {
      location: {
        ...(locationDraft.name ? { name: locationDraft.name } : {}),
        mode: locationDraft.mode,
        ...(locationDraft.center ? { center: locationDraft.center } : {}),
        ...(locationDraft.placeId ? { placeId: locationDraft.placeId } : {}),
        ...(locationDraft.countryCode ? { countryCode: locationDraft.countryCode } : {}),
        ...(locationDraft.country ? { country: locationDraft.country } : {}),
        ...(locationDraft.region ? { region: locationDraft.region } : {}),
        ...(locationDraft.city ? { city: locationDraft.city } : {}),
        ...(locationDraft.formattedAddress ? { formattedAddress: locationDraft.formattedAddress } : {}),
      },
      area: {
        type: areaDraft.type,
        ...(areaDraft.radiusMeters ? { radiusMeters: areaDraft.radiusMeters } : {}),
        ...(areaDraft.geometry ? { geometry: areaDraft.geometry } : {}),
        ...(areaDraft.bounds ? { bounds: areaDraft.bounds } : {}),
      },
      businessTypes: selectedBusinessTypes,
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
    };
    createDiscovery.mutate(input, {
      onSuccess: ({ sessionId: id }) => {
        clearSelection();
        setSessionId(id);
        setStep(3);
      },
    });
  };

  const handleNext = () => {
    if (step === 2) startAnalysis();
    else nextStep();
  };

  const openResult = useCallback(
    (result: DiscoveryResult) => {
      mapSync.setSelectedResultId(result.id);
      drawer.open(result.id);
    },
    [drawer, mapSync],
  );
  const openResultId = useCallback(
    (id: string) => {
      mapSync.setSelectedResultId(id);
      drawer.open(id);
    },
    [drawer, mapSync],
  );

  const addLead = useCallback(
    (result: DiscoveryResult) => {
      if (!sessionId) return;
      importResult.mutate({ resultId: result.id });
    },
    [importResult, sessionId],
  );
  const addingId = importResult.isPending ? importResult.variables?.resultId ?? null : null;

  const handleNewSearch = () => {
    drawer.close();
    clearSelection();
    clearFilters();
    resetWizard();
    setSessionId(null);
    setImportDialog({ open: false, selection: { kind: 'ALL_NEW' } });
  };

  const handleViewLeads = () => {
    setImportDialog((state) => ({ ...state, open: false }));
    router.push('/leads');
  };

  const handleNextResultPage = async () => {
    const nextPageIndex = resultPageIndex + 1;
    if (resultPages[nextPageIndex]) {
      setResultPageIndex(nextPageIndex);
      return;
    }
    if (!resultsQuery.hasNextPage || resultsQuery.isFetchingNextPage) return;
    const next = await resultsQuery.fetchNextPage({ cancelRefetch: false });
    if (next.data?.pages[nextPageIndex]) setResultPageIndex(nextPageIndex);
  };

  const handleReopen = (target: DiscoverySession) => {
    // Rehydrate the map drafts so the reopened session shows its own area.
    setLocationDraft({
      name: target.location.name ?? '',
      mode: target.location.mode ?? 'search',
      center: target.location.center,
      countryCode: target.location.countryCode,
      country: target.location.country,
      region: target.location.region,
      city: target.location.city,
      formattedAddress: target.location.formattedAddress,
      placeId: target.location.placeId,
    });
    setAreaDraft({
      type: target.area.type,
      geometry: target.area.geometry,
      radiusMeters: target.area.radiusMeters,
      bounds: target.area.bounds,
    });
    setSelectedBusinessTypes(target.businessTypes.map((bt) => bt.id).filter(Boolean));
    setKeyword(target.keyword ?? '');
    clearSelection();
    setSessionId(target.id);
    setStep(3);
    setHistoryOpen(false);
  };

  const handleRerun = (target: DiscoverySession) => {
    const input = buildCreateInput(target);
    if (!input) return;
    createDiscovery.mutate(input, {
      onSuccess: ({ sessionId: id }) => {
        clearSelection();
        setSessionId(id);
        setStep(3);
        setHistoryOpen(false);
      },
    });
  };

  // Drawer prev/next across the loaded results.
  const drawerIndex = drawer.selectedId ? results.findIndex((r) => r.id === drawer.selectedId) : -1;
  const goToResult = (index: number) => {
    const result = results[index];
    if (result) openResult(result);
  };

  const mapCenter = locationDraft.center ?? mapSync.mapViewport.center ?? DEFAULT_CENTER;

  // ── Render ───────────────────────────────────────────────────────────────────
  const stepContent = step === 0 ? <LocationStep /> : step === 1 ? <BusinessTypeStep /> : <ReviewStep />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2 ring-1 ring-primary/20">
            <Radar className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold leading-tight text-foreground">{t('leadgen.title', 'Lead generation')}</h1>
            <p className="text-[13px] text-muted-foreground">
              {t('leadgen.subtitle', 'Discover businesses on the map and add them to your CRM.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leadgen.saved.title', 'Saved searches')}
          </Button>
          {inResults && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={handleNewSearch}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leadgen.import.summary.newSearch', 'New search')}
            </Button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {showResults && session ? (
          <ResultsPanel
            sessionId={sessionId!}
            session={session}
            results={results}
            markers={markers}
            isLoading={resultsQuery.isLoading}
            isError={resultsQuery.isError}
            errorStatusCode={(resultsQuery.error as { statusCode?: number } | null)?.statusCode}
            onRetry={() => void resultsQuery.refetch()}
            pageIndex={resultPageIndex}
            pageSize={pageSize}
            filteredTotal={filteredTotal}
            loadedPages={resultPages.length}
            hasNextPage={resultsQuery.hasNextPage}
            isFetchingNextPage={resultsQuery.isFetchingNextPage}
            isFetchNextPageError={resultsQuery.isFetchNextPageError}
            onFirstPage={() => setResultPageIndex(0)}
            onPreviousPage={() => setResultPageIndex((page) => Math.max(0, page - 1))}
            onNextPage={() => void handleNextResultPage()}
            onPageSizeChange={(size) => {
              setResultPageIndex(0);
              setPageSize(size);
            }}
            markersLoading={markerPagingEnabled && (markersQuery.isLoading || markersQuery.isFetchingNextPage)}
            markersError={markersQuery.isError || markersQuery.isFetchNextPageError}
            onRetryMarkers={() => void markersQuery.retryFailedPage()}
            onOpenResult={openResult}
            onOpenResultId={openResultId}
            onAddLead={addLead}
            addingId={addingId}
            onAddAllNew={() => setImportDialog({ open: true, selection: { kind: 'ALL_NEW' } })}
            onAddSelected={() => setImportDialog({ open: true, selection: { kind: 'SELECTED', resultIds: selectedIds } })}
            onNewSearch={handleNewSearch}
          />
        ) : showProgress ? (
          <div className="h-full overflow-y-auto scrollbar-thin">
            {session ? (
              <DiscoveryProgress
                session={session}
                onCancel={() => sessionId && cancelDiscovery.mutate(sessionId)}
                isCanceling={cancelDiscovery.isPending}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                <p className="text-sm">{t('leadgen.analyze.title', 'Starting analysis…')}</p>
              </div>
            )}
          </div>
        ) : (
          // ── Wizard shell ──
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <aside className="flex w-full min-h-0 flex-col lg:w-[440px] lg:border-e lg:border-border">
              {/* Stepper */}
              <div className="shrink-0 border-b border-border px-4 py-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  {t('leadgen.wizard.stepCount', 'Step {current} of {total}', { current: step + 1, total: STEP_LABELS.length })}
                </p>
                <ol className="flex items-center gap-1.5">
                  {STEP_LABELS.map((label, index) => {
                    const done = index < step;
                    const active = index === step;
                    return (
                      <li key={label.key} className="flex flex-1 items-center gap-1.5">
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                            done
                              ? 'border-primary bg-primary text-primary-foreground'
                              : active
                                ? 'border-primary text-primary'
                                : 'border-border text-muted-foreground/50',
                          )}
                        >
                          {index + 1}
                        </div>
                        <span
                          className={cn(
                            'hidden truncate text-xs sm:inline lg:hidden xl:inline',
                            active ? 'font-medium text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {t(label.key, label.fallback)}
                        </span>
                        {index < STEP_LABELS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden="true" />}
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-4">{stepContent}</div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
                <Button variant="ghost" onClick={prevStep} disabled={step === 0} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
                  {t('leadgen.wizard.back', 'Back')}
                </Button>
                <Button onClick={handleNext} disabled={!canProceed || createDiscovery.isPending} className="gap-1.5">
                  {createDiscovery.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {step === 2 ? t('leadgen.wizard.startAnalysis', 'Start analysis') : t('leadgen.wizard.next', 'Next')}
                  {step !== 2 && <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />}
                </Button>
              </div>
            </aside>

            {/* Map */}
            <div className={cn('relative min-h-[320px] flex-1', step !== 0 && 'hidden lg:block')}>
              <DiscoveryMap
                center={mapCenter}
                zoom={mapSync.mapViewport.zoom}
                area={areaDraft}
                drawingMode={mapDrawingMode}
                onAreaChange={handleAreaChange}
                onViewportChange={(viewport) => mapSync.setMapViewport({ center: viewport.center, zoom: viewport.zoom })}
                className="h-full w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Saved searches */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{t('leadgen.saved.title', 'Saved searches')}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
            <SavedSearches onView={handleReopen} onRerun={handleRerun} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Import preview / summary */}
      {sessionId && (
        <ImportPreviewDialog
          open={importDialog.open}
          onOpenChange={(open) => setImportDialog((state) => ({ ...state, open }))}
          sessionId={sessionId}
          selection={importDialog.selection}
          users={usersQuery.data ?? []}
          onViewLeads={handleViewLeads}
          onNewSearch={handleNewSearch}
        />
      )}

      {/* Detail drawer (?detail=) */}
      <BusinessDetailDrawer
        sessionId={sessionId}
        resultId={drawer.selectedId}
        open={drawer.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            drawer.close();
            mapSync.setSelectedResultId(null);
          }
        }}
        hasPrevious={drawerIndex > 0}
        hasNext={drawerIndex >= 0 && drawerIndex < results.length - 1}
        onPrevious={() => goToResult(drawerIndex - 1)}
        onNext={() => goToResult(drawerIndex + 1)}
      />
    </div>
  );
}
