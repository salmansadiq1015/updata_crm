'use client';

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { List, Map as MapIcon, MapPinned, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { leadKeys, useEnrichJob, useLeadFilterOptions, useLeadMap } from '../../hooks/use-leads';
import { leadApi } from '../../services/lead-api';
import { useLeadsFilters } from '../../state/leads-store';
import type { Lead } from '../../types/lead-types';
import { Button, ConfirmDialog, useLanguage } from '../lead-ui-kit';
import { FILTER_ALL, buildLeadFilterParams } from '../lead-ui-constants';
import type { LeadUser } from '../lead-ui-utils';
import { LeadFilterBar } from '../lead-filter-bar';
import { LeadDetailDrawer } from '../lead-detail-drawer';
import { LeadFormDialog } from '../lead-form-dialog';
import { LeadBulkActionBar } from '../lead-bulk-action-bar';
import { LeadBulkEmailDialog } from '../lead-bulk-email-dialog';
import { LeadBulkWhatsAppDialog } from '../lead-bulk-whatsapp-dialog';
import type { BulkWhatsAppSummary } from '../lead-bulk-whatsapp-dialog';
import { useLeadBulkActions } from '../use-lead-bulk-actions';
import type { BulkLeadResult } from '../use-lead-bulk-actions';
import { LeadsMap } from './leads-map';
import { LeadMapSidebar } from './lead-map-sidebar';
import { LeadMapStats } from './lead-map-stats';
import { LeadMapToolbar } from './lead-map-toolbar';
import { LeadMapPreviewCard } from './lead-map-preview-card';
import { isPointInArea } from './lead-map-types';
import type { LeadMapArea, LeadMapDrawMode, LeadMapFocus, LeadMapPoint } from './lead-map-types';

// Switzerland-ish default view; the first successful load fits to the real leads.
const DEFAULT_CENTER = { lat: 46.8, lng: 8.23 };
const DEFAULT_ZOOM = 7;
const NO_LEADS: Lead[] = [];

type LeadMapViewProps = {
  open: boolean;
  onClose: () => void;
  users: LeadUser[];
  currentUserId: string | null;
};

/**
 * Full-screen Leads map overlay. Launched from the leads header; the leads page
 * stays mounted underneath, so closing it restores filters/search/selection and
 * scroll untouched. It reads the SAME filter store as the list, so the map is
 * always showing exactly the list's filtered set.
 */
export function LeadMapView({ open, onClose, users, currentUserId }: LeadMapViewProps) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.LEAD_WRITE);
  const canDelete = hasPermission(PERMISSIONS.LEAD_DELETE);
  const canEmail = hasPermission(PERMISSIONS.CRM_WRITE);
  const canWhatsApp = hasPermission(PERMISSIONS.LEAD_WHATSAPP);
  const canEnrich = hasPermission(PERMISSIONS.LEAD_ENRICH);
  const selectable = canWrite || canDelete || canEmail || canWhatsApp || canEnrich;

  const { filters, setFilters, clearFilters } = useLeadsFilters();
  // ── Query (same params as the list; deferred until the map is open) ─────────
  const debouncedSearch = useDebounce(filters.search, 300);
  const searchTerm = debouncedSearch.trim().slice(0, 100);
  const params = useMemo(
    () => buildLeadFilterParams(filters, currentUserId, searchTerm),
    [filters, currentUserId, searchTerm],
  );
  const paramsKey = JSON.stringify(params);
  const filterOptionParams = useMemo(() => {
    const { limit: _limit, areaId: _areaId, ...facetFilters } = params;
    return facetFilters;
  }, [params]);
  const filterOptionsQuery = useLeadFilterOptions(filterOptionParams);
  useEffect(() => {
    const options = filterOptionsQuery.data;
    if (!options) return;
    if (filters.country !== FILTER_ALL && !options.countries.some((option) => option.id === filters.country)) {
      setFilters({ country: FILTER_ALL, city: FILTER_ALL, area: FILTER_ALL });
      return;
    }
    if (filters.city !== FILTER_ALL && !options.cities.some((option) =>
      option.id === filters.city && (filters.country === FILTER_ALL || option.countryId === filters.country))) {
      setFilters({ city: FILTER_ALL, area: FILTER_ALL });
      return;
    }
    if (filters.area !== FILTER_ALL && !options.areas.some((option) =>
      option.id === filters.area && (filters.city === FILTER_ALL || option.cityId === filters.city))) {
      setFilters({ area: FILTER_ALL });
    }
  }, [filterOptionsQuery.data, filters.area, filters.city, filters.country, setFilters]);
  const query = useLeadMap(params, { enabled: open });

  const data = query.data;
  const leads = data?.leads ?? NO_LEADS;
  const located = useMemo(() => leads.filter((l) => l.location), [leads]);
  const unlocated = useMemo(() => leads.filter((l) => !l.location), [leads]);
  const points = useMemo<LeadMapPoint[]>(
    () => located.map((l) => ({ id: l.id, lat: l.location!.lat, lng: l.location!.lng, status: l.status })),
    [located],
  );
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const locatedRef = useRef(located);
  useEffect(() => {
    locatedRef.current = located;
  });

  // ── View state ──────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focus, setFocus] = useState<LeadMapFocus>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [drawMode, setDrawMode] = useState<LeadMapDrawMode>(null);
  const [area, setArea] = useState<LeadMapArea | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [mobilePane, setMobilePane] = useState<'map' | 'list'>('map');
  const [emailState, setEmailState] = useState<{ open: boolean; leads: Lead[] }>({ open: false, leads: [] });
  const [whatsappState, setWhatsappState] = useState<{ open: boolean; leads: Lead[] }>({ open: false, leads: [] });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [enrichConfirmOpen, setEnrichConfirmOpen] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);
  const [geocodingIds, setGeocodingIds] = useState<Record<string, boolean>>({});
  const [geocodingAll, setGeocodingAll] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{ done: number; total: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const didInitialFit = useRef(false);
  const geocodeCancelRef = useRef(false);
  // The control that opened the overlay — focus returns to it on close (a11y).
  const triggerRef = useRef<HTMLElement | null>(null);

  const selectedLead = selectedId ? leadById.get(selectedId) ?? null : null;
  const previewLead = selectedLead && selectedLead.location ? selectedLead : null;

  const selectedIds = useMemo(() => Object.keys(selection).filter((id) => selection[id]), [selection]);
  const selectedLeads = useMemo(() => leads.filter((l) => selection[l.id]), [leads, selection]);

  const visibleIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selection[id]);
  const someSelected = visibleIds.some((id) => selection[id]);

  const total = data?.total ?? leads.length;
  const mapped = data?.withLocation ?? located.length;
  const missing = data?.withoutLocation ?? unlocated.length;

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.status !== FILTER_ALL ||
    filters.source !== FILTER_ALL ||
    filters.type !== FILTER_ALL ||
    filters.country !== FILTER_ALL ||
    filters.city !== FILTER_ALL ||
    filters.area !== FILTER_ALL ||
    filters.businessType !== FILTER_ALL ||
    filters.assignedTo !== FILTER_ALL;

  // ── Reset on open, and when the filtered set changes ────────────────────────
  useEffect(() => {
    if (!open) {
      geocodeCancelRef.current = true; // stop any running "geocode all" loop
      return;
    }
    geocodeCancelRef.current = false;
    setSelection({});
    setSelectedId(null);
    setHoveredId(null);
    setArea(null);
    setDrawMode(null);
    setDetailId(null);
    setEditLead(null);
    setEnrichJobId(null);
    setGeocodingIds({});
    setGeocodingAll(false);
    setGeocodeProgress(null);
    didInitialFit.current = false;
  }, [open]);

  useEffect(() => {
    // A filter/search change invalidates the current selection + drawn area and
    // the focused lead (which may no longer be in the set).
    setSelection({});
    setSelectedId(null);
    setArea(null);
    setDrawMode(null);
  }, [paramsKey]);

  // Fit the map to the real leads once per open, as soon as they arrive.
  useEffect(() => {
    if (!open || didInitialFit.current) return;
    if (query.isSuccess && located.length > 0) {
      didInitialFit.current = true;
      setFitSignal((s) => s + 1);
    }
  }, [open, query.isSuccess, located.length]);

  // Lock body scroll + wire Escape (cancel drawing first, then close) while open.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus management: on open, remember the trigger and move focus into the
  // overlay; on close, return focus to the trigger (a11y — a modal must not
  // strand keyboard/screen-reader users on an invisible control).
  useEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
      const raf = requestAnimationFrame(() => overlayRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
    const trigger = triggerRef.current;
    // Restore after the overlay has unmounted so focus lands on the live trigger.
    const raf = requestAnimationFrame(() => trigger?.focus?.());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawMode) {
        setDrawMode(null);
        return;
      }
      // Let the drawer / dialogs handle their own Escape first.
      if (detailId || editLead || emailState.open || whatsappState.open) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, drawMode, detailId, editLead, emailState.open, whatsappState.open, onClose]);

  // Fullscreen (on the overlay element).
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onClose();
  }, [onClose]);

  // Keep Tab focus within the overlay. This listener lives ON the overlay element,
  // so events from nested Radix dialogs / menus (which portal to <body>, outside
  // this subtree) never reach it — those layers keep their own focus management.
  const handleFocusTrap = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = overlayRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.getClientRects().length > 0);
    if (focusables.length === 0) {
      e.preventDefault();
      root.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || active === root || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // ── Selection + map interaction ─────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelection((prev) => {
      const everySelected = visibleIds.length > 0 && visibleIds.every((id) => prev[id]);
      if (everySelected) return {};
      return Object.fromEntries(visibleIds.map((id) => [id, true]));
    });
  }, [visibleIds]);

  const clearSelection = useCallback(() => setSelection({}), []);

  const activateLocated = useCallback((lead: Lead) => {
    setSelectedId(lead.id);
    setMobilePane('map');
    if (lead.location) setFocus({ lat: lead.location.lat, lng: lead.location.lng, nonce: Date.now() });
  }, []);

  const activateUnlocated = useCallback((lead: Lead) => {
    setSelectedId(lead.id);
    setDetailId(lead.id);
  }, []);

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id);
    setMobilePane('map');
  }, []);

  const handleAreaDraw = useCallback(
    (drawn: LeadMapArea) => {
      setArea(drawn);
      setDrawMode(null);
      const inside: Record<string, boolean> = {};
      let count = 0;
      for (const lead of locatedRef.current) {
        if (lead.location && isPointInArea(lead.location, drawn)) {
          inside[lead.id] = true;
          count += 1;
        }
      }
      setSelection(inside);
      showSuccess(t('leads.map.area.selected', '{count} leads inside selected area', { count }));
    },
    [t],
  );

  const clearArea = useCallback(() => {
    setArea(null);
    setDrawMode(null);
  }, []);

  // ── Bulk actions (reuse the list's hooks + dialogs) ─────────────────────────
  const { bulkDelete, bulkAssign } = useLeadBulkActions();
  const bulkBusy = bulkDelete.isPending || bulkAssign.isPending || Boolean(enrichJobId);

  const finishBulk = (kind: 'delete' | 'assign', result: BulkLeadResult) => {
    const done = result.succeeded.length;
    const failed = result.failed.length;
    if (failed === 0) {
      showSuccess(
        kind === 'delete'
          ? t('leads.toast.bulkDeleted', 'Leads deleted: {count}', { count: done })
          : t('leads.toast.bulkAssigned', 'Leads updated: {count}', { count: done }),
      );
      clearSelection();
      return;
    }
    if (done === 0) {
      showError(result.failed[0]?.error ?? t('leads.toast.bulkFailed', 'The selected leads could not be changed'));
    } else {
      showError(t('leads.toast.bulkPartial', '{done} done, {failed} failed', { done, failed }));
    }
    setSelection(Object.fromEntries(result.failed.map(({ id }) => [id, true])));
  };

  const handleBulkDelete = async () => finishBulk('delete', await bulkDelete.mutateAsync(selectedIds));
  const handleBulkAssign = async (userId: string | null) =>
    finishBulk('assign', await bulkAssign.mutateAsync({ ids: selectedIds, assignedTo: userId }));

  const finishBulkWhatsApp = ({ opened, skipped }: BulkWhatsAppSummary) =>
    showSuccess(t('leads.bulk.whatsapp.summary', '{opened} opened, {skipped} skipped', { opened, skipped }));

  const finishBulkEmail = (result: BulkLeadResult) => {
    const sent = result.succeeded.length;
    const failed = result.failed.length;
    const summary = t('leads.bulk.emailDialog.summary', '{sent} sent, {failed} failed', { sent, failed });
    if (failed === 0) showSuccess(summary);
    else showError(summary);
  };

  // Bulk enrich: a confirmed POST returns a jobId we poll until it settles, then
  // one honest summary toast (same flow as the list's bulk bar).
  const enrichJob = useEnrichJob(enrichJobId);
  useEffect(() => {
    if (!enrichJobId) return;
    const job = enrichJob.data;
    if (!job || (job.status !== 'done' && job.status !== 'failed')) return;
    const { enriched, skipped, failed } = job.counts;
    const summary = t('leads.bulk.enrichDialog.summary', '{enriched} enriched, {skipped} skipped, {failed} failed', {
      enriched,
      skipped,
      failed,
    });
    if (job.status === 'failed' || failed > 0) showError(summary);
    else showSuccess(summary);
    setEnrichJobId(null);
    clearSelection();
    void queryClient.invalidateQueries({ queryKey: leadKeys.maps() });
  }, [enrichJob.data, enrichJobId, clearSelection, queryClient, t]);

  const handleBulkEnrich = async () => {
    const ids = selectedIds;
    setEnrichConfirmOpen(false);
    if (ids.length === 0) return;
    try {
      const { jobId } = await leadApi.enrichLeadsBulk(ids);
      if (jobId) setEnrichJobId(jobId);
      else showError(t('leads.toast.bulkFailed', 'The selected leads could not be changed'));
    } catch (error) {
      showError(error);
    }
  };

  // ── Geocoding (place address-less leads via keyless OSM/Nominatim) ───────────
  // Geocode one lead; returns whether it was placed. `silent` suppresses the
  // per-lead toast (used by "geocode all", which shows a single summary).
  const geocodeOne = useCallback(
    async (lead: Lead, silent = false): Promise<boolean> => {
      setGeocodingIds((prev) => ({ ...prev, [lead.id]: true }));
      try {
        const result = await leadApi.geocodeLead(lead.id);
        if (!silent) {
          if (result.geocoded) {
            showSuccess(t('leads.map.geocode.found', 'Location found for {name}', { name: lead.name }));
          } else {
            showError(t('leads.map.geocode.notFound', 'No location found for {name}', { name: lead.name }));
          }
        }
        return result.geocoded;
      } catch (error) {
        if (!silent) showError(error);
        return false;
      } finally {
        setGeocodingIds((prev) => {
          const next = { ...prev };
          delete next[lead.id];
          return next;
        });
      }
    },
    [t],
  );

  const handleGeocodeOne = useCallback(
    async (lead: Lead) => {
      const placed = await geocodeOne(lead);
      if (placed) void queryClient.invalidateQueries({ queryKey: leadKeys.maps() });
    },
    [geocodeOne, queryClient],
  );

  const handleGeocodeAll = useCallback(async () => {
    const snapshot = [...unlocated];
    if (geocodingAll || snapshot.length === 0) return;
    geocodeCancelRef.current = false;
    setGeocodingAll(true);
    setGeocodeProgress({ done: 0, total: snapshot.length });
    let found = 0;
    for (let i = 0; i < snapshot.length; i += 1) {
      if (geocodeCancelRef.current) break;
      // eslint-disable-next-line no-await-in-loop
      if (await geocodeOne(snapshot[i], true)) found += 1;
      setGeocodeProgress({ done: i + 1, total: snapshot.length });
      // Be a good Nominatim citizen: ≤1 request/second between leads.
      if (i < snapshot.length - 1 && !geocodeCancelRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }
    setGeocodingAll(false);
    setGeocodeProgress(null);
    void queryClient.invalidateQueries({ queryKey: leadKeys.maps() });
    showSuccess(
      t('leads.map.geocode.summary', 'Located {found} of {total} leads', { found, total: snapshot.length }),
    );
  }, [geocodeOne, geocodingAll, queryClient, t, unlocated]);

  // ── Drawer navigation over the full (located + unlocated) set ───────────────
  const drawerIndex = detailId ? leads.findIndex((l) => l.id === detailId) : -1;
  const goToLeadAt = (index: number) => {
    const lead = leads[index];
    if (lead) setDetailId(lead.id);
  };

  if (!open) return null;

  const isError = query.isError && !data;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('leads.map.title', 'Lead map')}
      tabIndex={-1}
      onKeyDown={handleFocusTrap}
      className="fixed inset-0 z-40 flex flex-col bg-background outline-none"
    >
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-xl bg-primary/10 p-2 ring-1 ring-primary/20">
            <MapPinned className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{t('leads.map.title', 'Lead map')}</h2>
            <p className="truncate text-[12px] text-muted-foreground">
              {t('leads.map.showingCount', 'Showing {shown} of {total}', { shown: mapped, total })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile pane toggle */}
          <div role="group" aria-label={t('leads.view.label', 'Layout')} className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5 lg:hidden">
            {(
              [
                { pane: 'map', icon: MapIcon, label: t('leads.map.pane.map', 'Map') },
                { pane: 'list', icon: List, label: t('leads.map.pane.list', 'List') },
              ] as const
            ).map(({ pane, icon: Icon, label }) => (
              <button
                key={pane}
                type="button"
                aria-pressed={mobilePane === pane}
                aria-label={label}
                onClick={() => setMobilePane(pane)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  mobilePane === pane ? 'bg-card text-foreground shadow-theme-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>

          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            aria-pressed={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('leads.map.filters', 'Filters')}</span>
            {hasActiveFilters ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
          </Button>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleClose} aria-label={t('common.close', 'Close')}>
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {/* Collapsible filters */}
      {showFilters ? (
        <div className="shrink-0 border-b border-border bg-background p-3">
          <LeadFilterBar
            search={filters.search}
            onSearchChange={(search) => setFilters({ search })}
            status={filters.status}
            onStatusChange={(status) => setFilters({ status })}
            source={filters.source}
            onSourceChange={(source) => setFilters({ source })}
            type={filters.type}
            onTypeChange={(type) => setFilters({ type })}
            country={filters.country}
            onCountryChange={(country) => setFilters({ country, city: FILTER_ALL, area: FILTER_ALL })}
            city={filters.city}
            onCityChange={(city) => setFilters({ city, area: FILTER_ALL })}
            area={filters.area}
            onAreaChange={(area) => setFilters({ area })}
            businessType={filters.businessType}
            onBusinessTypeChange={(businessType) => setFilters({ businessType })}
            filterOptions={filterOptionsQuery.data}
            filterOptionsLoading={filterOptionsQuery.isLoading}
            assignedTo={filters.assignedTo}
            onAssignedToChange={(assignedTo) => setFilters({ assignedTo })}
            users={users}
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
          />
        </div>
      ) : null}

      {/* Body: sidebar + map */}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'h-full w-full shrink-0 border-e border-border lg:block lg:w-[360px] xl:w-[400px]',
            mobilePane === 'list' ? 'block' : 'hidden lg:block',
          )}
        >
          <LeadMapSidebar
            located={located}
            unlocated={unlocated}
            users={users}
            isLoading={query.isLoading}
            isError={isError}
            onRetry={() => void query.refetch()}
            search={filters.search}
            onSearchChange={(search) => setFilters({ search })}
            activeId={selectedId}
            hoveredId={hoveredId}
            selectedIds={selection}
            selectable={selectable}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onActivateLocated={activateLocated}
            onActivateUnlocated={activateUnlocated}
            onHover={setHoveredId}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
            total={total}
            shown={leads.length}
            canGeocode={canWrite}
            geocodingIds={geocodingIds}
            geocodingAll={geocodingAll}
            geocodeProgress={geocodeProgress}
            onGeocodeOne={handleGeocodeOne}
            onGeocodeAll={handleGeocodeAll}
          />
        </aside>

        <div className={cn('relative h-full flex-1', mobilePane === 'map' ? 'block' : 'hidden lg:block')}>
          <LeadsMap
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            points={points}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onMarkerClick={handleMarkerClick}
            onMarkerHover={setHoveredId}
            focus={focus}
            fitSignal={fitSignal}
            drawMode={drawMode}
            area={area}
            onAreaDraw={handleAreaDraw}
            className="h-full w-full"
          />

          {/* Stats */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-3">
            <LeadMapStats total={total} mapped={mapped} missing={missing} selected={selectedIds.length} limited={data?.limited} />
          </div>

          {/* Toolbar */}
          <LeadMapToolbar
            onFitAll={() => setFitSignal((s) => s + 1)}
            drawMode={drawMode}
            onSetDrawMode={setDrawMode}
            hasArea={Boolean(area)}
            onClearArea={clearArea}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            className="absolute end-3 top-16 z-[1000]"
          />

          {/* Preview card */}
          {previewLead ? (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex justify-center sm:inset-x-auto sm:bottom-4 sm:start-4 sm:justify-start">
              <LeadMapPreviewCard
                lead={previewLead}
                users={users}
                canWrite={canWrite}
                onClose={() => setSelectedId(null)}
                onView={(lead) => setDetailId(lead.id)}
                onEdit={(lead) => setEditLead(lead)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Bulk action bar (reuses the list's selection bar) */}
      <LeadBulkActionBar
        selectedIds={selectedIds}
        users={users}
        canAssign={canWrite}
        canDelete={canDelete}
        canEmail={canEmail}
        canWhatsApp={canWhatsApp}
        canEnrich={canEnrich}
        isBusy={bulkBusy}
        onAssign={(userId) => void handleBulkAssign(userId)}
        onDelete={() => void handleBulkDelete()}
        onEmail={() => setEmailState({ open: true, leads: selectedLeads })}
        onWhatsApp={() => setWhatsappState({ open: true, leads: selectedLeads })}
        onEnrich={() => setEnrichConfirmOpen(true)}
        onClear={clearSelection}
      />

      {/* In-overlay detail drawer, edit form and bulk dialogs */}
      <LeadDetailDrawer
        leadId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(value) => {
          if (!value) setDetailId(null);
        }}
        users={users}
        hasPrevious={drawerIndex > 0}
        hasNext={drawerIndex >= 0 && drawerIndex < leads.length - 1}
        onPrevious={() => goToLeadAt(drawerIndex - 1)}
        onNext={() => goToLeadAt(drawerIndex + 1)}
        onDeleted={() => {
          setDetailId(null);
          setSelectedId(null);
        }}
      />

      <LeadFormDialog
        open={Boolean(editLead)}
        onOpenChange={(value) => {
          if (!value) setEditLead(null);
        }}
        lead={editLead}
        users={users}
      />

      <LeadBulkEmailDialog
        open={emailState.open}
        leads={emailState.leads}
        onOpenChange={(value) => {
          setEmailState((state) => ({ ...state, open: value }));
          if (!value) {
            clearSelection();
            void queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
          }
        }}
        onComplete={finishBulkEmail}
      />

      <LeadBulkWhatsAppDialog
        open={whatsappState.open}
        leads={whatsappState.leads}
        onOpenChange={(value) => {
          setWhatsappState((state) => ({ ...state, open: value }));
          if (!value) clearSelection();
        }}
        onComplete={finishBulkWhatsApp}
      />

      <ConfirmDialog
        open={enrichConfirmOpen}
        onOpenChange={setEnrichConfirmOpen}
        title={t('leads.bulk.enrichDialog.title', 'Enrich {count} lead(s) from their websites?', {
          count: selectedIds.length,
        })}
        confirmText={t('leads.bulk.enrichDialog.confirm', 'Enrich')}
        cancelText={t('common.cancel', 'Cancel')}
        loading={Boolean(enrichJobId)}
        onConfirm={() => void handleBulkEnrich()}
      />
    </div>
  );
}

export default LeadMapView;
