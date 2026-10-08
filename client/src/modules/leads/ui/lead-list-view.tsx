'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRightLeft,
  Eye,
  Inbox,
  LayoutGrid,
  List,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  Radar,
  SearchX,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useDrawer } from '@/shared/hooks/use-drawer';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import {
  leadKeys,
  useDeleteLead,
  useEnrichJob,
  useFlattenedLeads,
  useLeadFilterOptions,
  useLeads,
} from '../hooks/use-leads';
import { leadApi } from '../services/lead-api';
import {
  useLeadsFilters,
  useLeadsRowSelection,
  useLeadsStore,
  useSelectedLeadIds,
} from '../state/leads-store';
import type { Lead, LeadListParams } from '../types/lead-types';
import {
  Button,
  ConfirmDialog,
  DataTableShell,
  RowActionsMenu,
  useLanguage,
} from './lead-ui-kit';
import type {
  ShellRowRef,
  ShellRowSelection,
  ShellSorting,
  ShellUpdater,
} from './lead-ui-kit';
import {
  COLUMN_TO_SORT_FIELD,
  DEFAULT_LEAD_PAGE_SIZE,
  FILTER_ALL,
  SORT_FIELD_TO_COLUMN,
  buildLeadFilterParams,
} from './lead-ui-constants';
import { buildGoogleMapsUrl, copyText } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { ConvertDialog } from './convert-dialog';
import { LeadBulkActionBar } from './lead-bulk-action-bar';
import { LeadBulkEmailDialog } from './lead-bulk-email-dialog';
import { LeadBulkWhatsAppDialog } from './lead-bulk-whatsapp-dialog';
import type { BulkWhatsAppSummary } from './lead-bulk-whatsapp-dialog';
import { LeadCard } from './lead-card';
import { LeadDetailDrawer } from './lead-detail-drawer';
import { LeadExportMenu } from './lead-export-menu';
import { ExtensionConnectCard } from './extension-connect-card';
import { ExtensionImportBanner } from './extension-import-banner';
import { useExtensionImportProgress } from '../hooks/use-extension-import-progress';
import { LeadFilterBar } from './lead-filter-bar';
import { LeadFormDialog } from './lead-form-dialog';
import { LeadImportDialog } from './lead-import-dialog';
import { useLeadColumns } from './lead-table-columns';
import { useLeadBulkActions } from './use-lead-bulk-actions';
import type { BulkLeadResult } from './use-lead-bulk-actions';
import { LeadMapView } from './map/lead-map-view';

type ViewMode = 'table' | 'grid';
type AuthSlice = { user?: { _id?: string; id?: string } | null };

// Stable empties, so memoised children are not re-rendered by fresh [] literals.
const NO_USERS: LeadUser[] = [];
const NO_LEADS: Lead[] = [];

const DEFAULT_SORT = { sortBy: 'createdAt', sortOrder: 'desc' } as const;

/**
 * The /leads page: filter bar + (table | grid) over the cursor-paginated lead
 * list, a selection bar for bulk actions and a detail drawer synced to the
 * `?detail=` URL param.
 *
 * Server state comes from `useLeads`; filters, sort and row selection live in
 * the leads store; the open lead lives in the URL.
 */
export function LeadListView() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.LEAD_WRITE);
  const canConvert = hasPermission(PERMISSIONS.LEAD_CONVERT);
  const canDelete = hasPermission(PERMISSIONS.LEAD_DELETE);
  const canDiscover = hasPermission(PERMISSIONS.DISCOVERY_READ);
  const canImport = hasPermission(PERMISSIONS.LEAD_IMPORT);
  const canExport = hasPermission(PERMISSIONS.LEAD_READ);
  const canEmail = hasPermission(PERMISSIONS.CRM_WRITE);
  const canWhatsApp = hasPermission(PERMISSIONS.LEAD_WHATSAPP);
  const canEnrich = hasPermission(PERMISSIONS.LEAD_ENRICH);
  // Live progress of imports coming from the Chrome extension (Socket.IO).
  const { progress: extImportProgress, dismiss: dismissExtImport } = useExtensionImportProgress(canExport);

  const currentUserId = useAuthStore((state: AuthSlice) => state.user?._id ?? state.user?.id ?? null);
  const usersQuery = useWorkspaceUsers();
  const users: LeadUser[] = usersQuery.data ?? NO_USERS;
  const filterOptionsQuery = useLeadFilterOptions();

  // ── Store: filters, sort, selection ────────────────────────────────────────
  const { filters, sort, setFilters, clearFilters, setSort } = useLeadsFilters();
  const rowSelection = useLeadsRowSelection();
  const selectedIds = useSelectedLeadIds();
  const clearSelection = useLeadsStore((state) => state.clearSelection);
  const toggleRow = useLeadsStore((state) => state.toggleRow);

  // ── URL: which lead the drawer shows ───────────────────────────────────────
  const drawer = useDrawer('detail');

  // ── Local view state ───────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [mapOpen, setMapOpen] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_LEAD_PAGE_SIZE);
  const [formState, setFormState] = useState<{ open: boolean; lead: Lead | null }>({ open: false, lead: null });
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Bulk contact dialogs snapshot the selection on open, so clearing the
  // selection on close never empties the list the dialog is working on.
  const [emailState, setEmailState] = useState<{ open: boolean; leads: Lead[] }>({ open: false, leads: [] });
  const [whatsappState, setWhatsappState] = useState<{ open: boolean; leads: Lead[] }>({ open: false, leads: [] });
  // Bulk enrich runs server-side as a job: confirm → fire → poll by id → summarise.
  const [enrichConfirmOpen, setEnrichConfirmOpen] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);

  // ── Query ──────────────────────────────────────────────────────────────────
  const debouncedSearch = useDebounce(filters.search, 300);
  const searchTerm = debouncedSearch.trim().slice(0, 100);

  const params = useMemo<Omit<LeadListParams, 'cursor'>>(
    () => ({
      limit: pageSize,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      ...buildLeadFilterParams(filters, currentUserId, searchTerm),
    }),
    [pageSize, sort.sortBy, sort.sortOrder, filters, currentUserId, searchTerm],
  );
  const paramsKey = JSON.stringify(params);

  const query = useLeads(params);
  const pages = query.data?.pages;
  const allLeads = useFlattenedLeads(query.data);

  // The table shows one cursor page at a time (Prev / Next like the customers
  // list). Pages already fetched are kept by the infinite query, so going back
  // is free and going forward fetches only what is missing. The page index is
  // tied to the params it was chosen under: changing a filter starts at page 1.
  const [pageState, setPageState] = useState({ key: paramsKey, index: 0 });
  const loadedPages = pages?.length ?? 0;
  let pageIndex = Math.min(pageState.key === paramsKey ? pageState.index : 0, Math.max(loadedPages - 1, 0));
  // A page emptied by deletions falls back to the previous one.
  while (pageIndex > 0 && (pages?.[pageIndex]?.data.length ?? 0) === 0) pageIndex -= 1;

  const leads = pages?.[pageIndex]?.data ?? NO_LEADS;
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex < loadedPages - 1 || Boolean(query.hasNextPage);

  // Total matching leads (server-counted) → an honest "page X of Y". The total
  // is the same on every page; read it from whichever loaded page carries it.
  const totalLeads = pages?.find((page) => typeof page.pagination.total === 'number')?.pagination.total;
  const totalPages = typeof totalLeads === 'number' && pageSize > 0
    ? Math.max(1, Math.ceil(totalLeads / pageSize))
    : undefined;
  const currentPage = pageIndex + 1;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const goNext = useCallback(async () => {
    if (pageIndex < loadedPages - 1) {
      setPageState({ key: paramsKey, index: pageIndex + 1 });
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;
    const result = await fetchNextPage();
    if (!result.isError) setPageState({ key: paramsKey, index: pageIndex + 1 });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadedPages, pageIndex, paramsKey]);

  const goPrev = useCallback(() => {
    setPageState({ key: paramsKey, index: Math.max(pageIndex - 1, 0) });
  }, [pageIndex, paramsKey]);

  const changePageSize = useCallback((size: number) => {
    setPageSize(size);
  }, []);

  // Selection is by id and survives re-renders, so it must not outlive the
  // rows it was made on: a bulk delete over rows you can no longer see is how
  // data gets lost. Drop it whenever the visible page changes, and on leave.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, paramsKey, pageIndex]);
  useEffect(() => clearSelection, [clearSelection]);

  const visibleSelectedIds = useMemo(() => {
    const visible = new Set(leads.map((lead) => lead.id));
    return selectedIds.filter((id) => visible.has(id));
  }, [leads, selectedIds]);

  // Full lead objects for the current selection — the bulk contact dialogs need
  // each lead's email/phone, not just its id.
  const selectedLeads = useMemo(() => {
    const picked = new Set(visibleSelectedIds);
    return allLeads.filter((lead) => picked.has(lead.id));
  }, [allLeads, visibleSelectedIds]);

  // ── Table plumbing ─────────────────────────────────────────────────────────
  const handleRowSelectionChange = useCallback((updater: ShellUpdater<ShellRowSelection>) => {
    const store = useLeadsStore.getState();
    store.setRowSelection(typeof updater === 'function' ? updater(store.rowSelection) : updater);
  }, []);

  const sorting = useMemo<ShellSorting>(
    () => [{ id: SORT_FIELD_TO_COLUMN[sort.sortBy] ?? 'discoveredAt', desc: sort.sortOrder === 'desc' }],
    [sort.sortBy, sort.sortOrder],
  );
  const handleSortingChange = useCallback(
    (updater: ShellUpdater<ShellSorting>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      const field = first ? COLUMN_TO_SORT_FIELD[first.id] : undefined;
      // "No sorting" has no meaning for the API: fall back to the default order.
      if (!first || !field) {
        setSort({ ...DEFAULT_SORT });
        return;
      }
      setSort({ sortBy: field, sortOrder: first.desc ? 'desc' : 'asc' });
    },
    [setSort, sorting],
  );

  // ── Drawer ─────────────────────────────────────────────────────────────────
  const { open: openDrawer, close: closeDrawer } = drawer;
  const openLead = useCallback(
    (lead: Lead) => {
      // The row already holds the whole lead: seed the detail cache so the
      // drawer opens filled instead of flashing a skeleton.
      queryClient.setQueryData<Lead>(leadKeys.detail(lead.id), (existing) => existing ?? lead);
      openDrawer(lead.id);
    },
    [openDrawer, queryClient],
  );

  const drawerIndex = drawer.selectedId ? allLeads.findIndex((lead) => lead.id === drawer.selectedId) : -1;
  const goToLeadAt = (index: number) => {
    const lead = allLeads[index];
    if (lead) openLead(lead);
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const deleteLead = useDeleteLead();
  const { bulkDelete, bulkAssign } = useLeadBulkActions();
  const bulkBusy = bulkDelete.isPending || bulkAssign.isPending || Boolean(enrichJobId);

  const handleCopyPhone = useCallback(
    async (phone: string) => {
      if (await copyText(phone)) showSuccess(t('leads.toast.phoneCopied', 'Phone number copied'));
      else showError(t('leads.toast.copyFailed', 'Could not copy to the clipboard'));
    },
    [t],
  );

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    if (drawer.selectedId === id) closeDrawer();
    deleteLead.mutate(id);
  };

  /** One summary toast per bulk action; failed rows stay selected for a retry. */
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
    useLeadsStore.getState().setRowSelection(Object.fromEntries(result.failed.map(({ id }) => [id, true])));
  };

  const handleBulkDelete = async () => {
    finishBulk('delete', await bulkDelete.mutateAsync(visibleSelectedIds));
  };
  const handleBulkAssign = async (userId: string | null) => {
    finishBulk('assign', await bulkAssign.mutateAsync({ ids: visibleSelectedIds, assignedTo: userId }));
  };

  // Snapshot the selected leads for each dialog (same summary-toast philosophy as
  // finishBulk: one truthful line, never a claim of delivery).
  const handleBulkEmail = () => setEmailState({ open: true, leads: selectedLeads });
  const handleBulkWhatsApp = () => setWhatsappState({ open: true, leads: selectedLeads });

  const finishBulkEmail = (result: BulkLeadResult) => {
    const sent = result.succeeded.length;
    const failed = result.failed.length;
    const summary = t('leads.bulk.emailDialog.summary', '{sent} sent, {failed} failed', { sent, failed });
    if (failed === 0) showSuccess(summary);
    else showError(summary);
  };

  const finishBulkWhatsApp = ({ opened, skipped }: BulkWhatsAppSummary) => {
    showSuccess(t('leads.bulk.whatsapp.summary', '{opened} opened, {skipped} skipped', { opened, skipped }));
  };

  // Bulk enrich: a confirmed POST returns a jobId we poll until it settles, then
  // one summary toast (enriched/skipped/failed) and a refresh — the same honest,
  // one-line summary philosophy as finishBulk.
  const enrichJob = useEnrichJob(enrichJobId);
  useEffect(() => {
    if (!enrichJobId) return;
    const data = enrichJob.data;
    if (!data || (data.status !== 'done' && data.status !== 'failed')) return;
    const { enriched, skipped, failed } = data.counts;
    const summary = t('leads.bulk.enrichDialog.summary', '{enriched} enriched, {skipped} skipped, {failed} failed', {
      enriched,
      skipped,
      failed,
    });
    if (data.status === 'failed' || failed > 0) showError(summary);
    else showSuccess(summary);
    setEnrichJobId(null);
    clearSelection();
    void queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
  }, [enrichJob.data, enrichJobId, clearSelection, queryClient, t]);

  const handleBulkEnrich = async () => {
    const ids = visibleSelectedIds;
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

  const columns = useLeadColumns({ users, onOpen: openLead, onCopyPhone: handleCopyPhone });

  const renderRowActions = useCallback(
    ({ row }: { row: ShellRowRef<Lead> }) => {
      const lead = row.original;
      const mapsUrl = buildGoogleMapsUrl(lead);
      return (
        <RowActionsMenu
          items={[
            { label: t('common.view', 'View'), icon: Eye, onSelect: () => openLead(lead) },
            {
              label: t('common.edit', 'Edit'),
              icon: Pencil,
              hidden: !canWrite,
              onSelect: () => setFormState({ open: true, lead }),
            },
            {
              label: t('leads.action.convert', 'Convert to customer'),
              icon: ArrowRightLeft,
              hidden: !canConvert || lead.status === 'converted',
              onSelect: () => setConvertTarget(lead),
            },
            {
              label: t('leads.action.openMaps', 'Open in Google Maps'),
              icon: MapPin,
              hidden: !mapsUrl,
              onSelect: () => {
                if (mapsUrl) window.open(mapsUrl, '_blank', 'noopener,noreferrer');
              },
            },
            { type: 'separator', hidden: !canDelete },
            {
              label: t('common.delete', 'Delete'),
              icon: Trash2,
              destructive: true,
              hidden: !canDelete,
              onSelect: () => setDeleteTarget(lead),
            },
          ]}
        />
      );
    },
    [canConvert, canDelete, canWrite, openLead, t],
  );

  // ── Derived UI state ───────────────────────────────────────────────────────
  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.status !== 'ALL' ||
    filters.source !== 'ALL' ||
    filters.type !== 'ALL' ||
    filters.place !== FILTER_ALL ||
    filters.businessType !== FILTER_ALL ||
    filters.assignedTo !== FILTER_ALL;

  const emptyState = hasActiveFilters ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
        <SearchX className="h-6 w-6 text-primary/50" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {t('leads.empty.filteredTitle', 'No leads match your filters')}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t('leads.empty.filteredBody', 'Try a different search term or reset the filters.')}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        {t('common.reset', 'Reset')}
      </Button>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
        <Inbox className="h-6 w-6 text-primary/50" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('leads.empty.title', 'No leads yet')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t('leads.empty.body', 'Add a lead by hand or discover businesses in an area to fill your pipeline.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canWrite && (
          <Button size="sm" className="gap-1.5" onClick={() => setFormState({ open: true, lead: null })}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.new', 'New lead')}
          </Button>
        )}
        {canDiscover && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/lead-generation">
              <Radar className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leads.discover', 'Find businesses')}
            </Link>
          </Button>
        )}
      </div>
    </div>
  );

  const hasLoadError = query.isError && leads.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-6 p-4 pb-28 sm:p-6 sm:pb-28">
          {extImportProgress && (
            <ExtensionImportBanner progress={extImportProgress} onDismiss={dismissExtImport} />
          )}
          {/* Page header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 ring-1 ring-primary/20">
                <Target className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[18px] font-semibold leading-tight text-foreground">
                  {t('leads.title', 'Leads')}
                </h1>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {t('leads.subtitle', 'Prospective customers from business discovery and manual entry')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label={t('leads.view.label', 'Layout')}
                className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5"
              >
                {(
                  [
                    { mode: 'table', icon: List, label: t('leads.view.table', 'Table view') },
                    { mode: 'grid', icon: LayoutGrid, label: t('leads.view.grid', 'Grid view') },
                  ] as const
                ).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    title={label}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      viewMode === mode ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>

              <Button variant="outline" className="h-9 gap-2" onClick={() => setMapOpen(true)}>
                <MapPinned className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('leads.map.open', 'View on map')}</span>
              </Button>

              {canDiscover && (
                <Button asChild variant="outline" className="h-9 gap-2">
                  <Link href="/lead-generation">
                    <Radar className="h-4 w-4" aria-hidden="true" />
                    {t('leads.discover', 'Find businesses')}
                  </Link>
                </Button>
              )}

              {canExport && <LeadExportMenu />}

              {/* Chrome Extension connect/status — gated by lead:read (same as
                  the page itself). Does not interfere with existing actions. */}
              {canExport && <ExtensionConnectCard />}

              {canImport && (
                <Button
                  variant="outline"
                  className="h-9 gap-2"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {t('leads.import.action', 'Import')}
                </Button>
              )}

              {canWrite && (
                <Button className="h-9 gap-2" onClick={() => setFormState({ open: true, lead: null })}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('leads.new', 'New lead')}
                </Button>
              )}
            </div>
          </div>

          <LeadFilterBar
            search={filters.search}
            onSearchChange={(search) => setFilters({ search })}
            status={filters.status}
            onStatusChange={(status) => setFilters({ status })}
            source={filters.source}
            onSourceChange={(source) => setFilters({ source })}
            type={filters.type}
            onTypeChange={(type) => setFilters({ type })}
            place={filters.place}
            onPlaceChange={(place) => setFilters({ place })}
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

          {/* Results */}
          {hasLoadError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-14 text-center"
            >
              <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {t('leads.error.title', 'Leads could not be loaded')}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  {t('leads.error.body', 'Check your connection and try again.')}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          ) : viewMode === 'table' ? (
            <DataTableShell
              columns={columns}
              data={leads}
              isLoading={query.isLoading}
              rowCount={leads.length}
              manualPagination
              manualSorting
              manualFiltering
              enableGlobalFilter={false}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={handleRowSelectionChange}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              onRowClick={openLead}
              emptyState={emptyState}
              cursorPagination={{
                pageSize,
                onPageSizeChange: changePageSize,
                hasNext,
                hasPrev,
                isFetching: query.isFetching,
                onNext: () => void goNext(),
                onPrev: goPrev,
                currentPage,
                totalPages,
              }}
              renderRowActions={renderRowActions}
            />
          ) : (
            <div className="space-y-4">
              {query.isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="skeleton-shimmer h-[190px] rounded-xl border border-border bg-muted/30" />
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30">{emptyState}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        users={users}
                        selected={Boolean(rowSelection[lead.id])}
                        onToggleSelect={toggleRow}
                        onOpen={openLead}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-2 py-2.5 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{t('leads.count', '{count} leads on this page', { count: leads.length })}</span>
                      {totalPages != null && (
                        <span className="tabular-nums">
                          · {t('common.pageOf', 'Page {page} of {total}', { page: currentPage, total: totalPages })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={goPrev}
                        disabled={!hasPrev || query.isFetching}
                      >
                        {t('common.previous', 'Previous')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => void goNext()}
                        disabled={!hasNext || query.isFetching}
                      >
                        {t('common.next', 'Next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <LeadBulkActionBar
        selectedIds={visibleSelectedIds}
        users={users}
        canAssign={canWrite}
        canDelete={canDelete}
        canEmail={canEmail}
        canWhatsApp={canWhatsApp}
        canEnrich={canEnrich}
        isBusy={bulkBusy}
        onAssign={(userId) => void handleBulkAssign(userId)}
        onDelete={() => void handleBulkDelete()}
        onEmail={handleBulkEmail}
        onWhatsApp={handleBulkWhatsApp}
        onEnrich={() => setEnrichConfirmOpen(true)}
        onClear={clearSelection}
      />

      <LeadBulkEmailDialog
        open={emailState.open}
        leads={emailState.leads}
        onOpenChange={(open) => {
          setEmailState((state) => ({ ...state, open }));
          if (!open) {
            clearSelection();
            void queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
          }
        }}
        onComplete={finishBulkEmail}
      />

      <LeadBulkWhatsAppDialog
        open={whatsappState.open}
        leads={whatsappState.leads}
        onOpenChange={(open) => {
          setWhatsappState((state) => ({ ...state, open }));
          if (!open) clearSelection();
        }}
        onComplete={finishBulkWhatsApp}
      />

      <LeadDetailDrawer
        leadId={drawer.selectedId}
        open={drawer.isOpen}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        users={users}
        hasPrevious={drawerIndex > 0}
        hasNext={drawerIndex >= 0 && drawerIndex < allLeads.length - 1}
        onPrevious={() => goToLeadAt(drawerIndex - 1)}
        onNext={() => goToLeadAt(drawerIndex + 1)}
      />

      <LeadFormDialog
        open={formState.open}
        onOpenChange={(open) => setFormState((state) => ({ ...state, open }))}
        lead={formState.lead}
        users={users}
      />

      {canImport && <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} />}

      <LeadMapView
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        users={users}
        currentUserId={currentUserId}
      />

      <ConvertDialog
        lead={convertTarget}
        open={Boolean(convertTarget)}
        onOpenChange={(open) => {
          if (!open) setConvertTarget(null);
        }}
        users={users}
      />

      <ConfirmDialog
        open={enrichConfirmOpen}
        onOpenChange={setEnrichConfirmOpen}
        title={t('leads.bulk.enrichDialog.title', 'Enrich {count} lead(s) from their websites?', {
          count: visibleSelectedIds.length,
        })}
        confirmText={t('leads.bulk.enrichDialog.confirm', 'Enrich')}
        cancelText={t('common.cancel', 'Cancel')}
        loading={Boolean(enrichJobId)}
        onConfirm={() => void handleBulkEnrich()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('leads.delete.title', 'Delete this lead?')}
        description={t(
          'leads.delete.description',
          '“{name}” will be removed from your pipeline. This action cannot be undone.',
          { name: deleteTarget?.name ?? '' },
        )}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
