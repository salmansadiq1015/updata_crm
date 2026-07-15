'use client';

import { useState, useMemo, useCallback } from 'react';
import { Clock, Eye, Pencil, Plus, Search, ShieldAlert, Trash2, Unlock } from 'lucide-react';
import { useFieldOpsTimeEntries } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsTimeMutations } from '@/modules/field-ops/hooks/use-field-ops-time-mutations';
import { FieldOpsTimeStatusBadge } from './field-ops-time-status-badge';
import { FieldOpsTimeDetailPanel } from './field-ops-time-detail-panel';
import { FieldOpsTimeFormDialog } from './field-ops-time-form-dialog';
import { FieldOpsTimeReleaseDialog } from './field-ops-time-release-dialog';
import { FieldOpsTimeOverrideDialog } from './field-ops-time-override-dialog';
import { RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// ── Empty state ───────────────────────────────────────────────────────────────

function TimeEmptyState({ de }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/15" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Clock className="h-7 w-7 text-primary animate-bounce" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">
          {de ? 'Keine Zeiteinträge gefunden' : 'No time entries found'}
        </p>
        <p className="text-xs text-muted-foreground">
          {de
            ? 'Einträge erscheinen hier, sobald Techniker ihre Zeit erfassen.'
            : 'Entries will appear here once technicians record their time.'}
        </p>
      </div>
    </div>
  );
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, colorClass }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={cn('text-2xl font-bold', colorClass)}>{value}</span>
    </div>
  );
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function fmtTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr.slice(11, 16) || null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(min) {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
}

function technicianName(entry) {
  const tech = entry?.technicianId;
  if (typeof tech === 'object' && tech) {
    return `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim() || tech.email || '';
  }
  return '';
}

function orderLabel(entry) {
  const order = entry?.orderId;
  if (typeof order === 'object' && order) {
    return `${order.assignmentNumber || ''} ${order.title || ''}`.trim();
  }
  return '';
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

// Stable empty reference — avoids a fresh [] on every render while the query
// has no data, which would otherwise cascade through the derived memos and
// retrigger TanStack's autoReset pagination (re-render loop).
const EMPTY_ENTRIES = [];

const getEntryRowId = (row) => row._id || row.id;

// ── Main component ────────────────────────────────────────────────────────────

export function FieldOpsTimeTable({ filters = {}, compact = false }) {
  const { t, locale: language } = useLanguage();
  const de = language === 'de';

  // Filters
  const [activityFilter, setActivityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  // UI state
  const [rowSelection, setRowSelection] = useState({});
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null);

  // Data
  const { data, isFetching } = useFieldOpsTimeEntries(filters);
  const entries = data ?? EMPTY_ENTRIES;

  // Stats (derived, no extra query)
  const stats = useMemo(() => ({
    total: entries.length,
    pending: entries.filter((e) => e.releaseStatus === 'PENDING').length,
    released: entries.filter((e) => e.releaseStatus === 'RELEASED').length,
    locked: entries.filter((e) => e.releaseStatus === 'LOCKED').length,
  }), [entries]);

  // Client-side filtering
  const filtered = useMemo(() => {
    const searchTerm = normalizeSearch(searchFilter);
    return entries.filter((e) => {
      if (activityFilter !== 'all' && e.activityType !== activityFilter) return false;
      if (statusFilter !== 'all' && e.releaseStatus !== statusFilter) return false;
      if (searchTerm) {
        const haystack = normalizeSearch([
          formatDate(e.date),
          technicianName(e),
          orderLabel(e),
          e.activityType,
          e.releaseStatus,
          e.note,
        ].join(' '));
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });
  }, [entries, activityFilter, statusFilter, searchFilter]);

  // Selected IDs
  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k),
    [rowSelection],
  );
  const pendingSelectedIds = useMemo(
    () => selectedIds.filter((id) => entries.find((e) => (e._id || e.id) === id)?.releaseStatus === 'PENDING'),
    [selectedIds, entries],
  );

  // Mutations
  const {
    createEntry, updateEntry, deleteEntry, bulkDelete,
    release, releaseBatch, override,
  } = useFieldOpsTimeMutations({
    onCreate: () => setShowCreate(false),
    onUpdate: () => setEditTarget(null),
    onDelete: () => { setDeleteTarget(null); setPanelOpen(false); },
    onBulkDelete: () => { setRowSelection({}); setBulkDeleteOpen(false); },
    onRelease: () => { setRowSelection({}); setReleaseOpen(false); setPanelOpen(false); },
    onOverride: () => { setOverrideTarget(null); setPanelOpen(false); },
  });

  // react-query keeps mutate identities stable; use it as the columns dep so the
  // column defs don't rebuild on every render (the mutation object itself is new each render).
  const releaseMutate = release.mutate;

  const handleCreate = useCallback(({ orderId, payload }) => {
    createEntry.mutate({ orderId, payload });
  }, [createEntry]);

  const handleUpdate = useCallback(({ orderId, payload }) => {
    if (!editTarget) return;
    updateEntry.mutate({ id: editTarget._id || editTarget.id, data: payload });
  }, [editTarget, updateEntry]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteEntry.mutate(deleteTarget._id || deleteTarget.id);
  }, [deleteTarget, deleteEntry]);

  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(selectedIds);
  }, [selectedIds, bulkDelete]);

  // Filter options
  const ACTIVITY_OPTS = [
    { value: 'all', de: 'Alle Tätigkeiten', en: 'All Activities' },
    ...Object.entries(ACTIVITY_TYPE_LABELS).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
  ];

  const STATUS_OPTS = [
    { value: 'all', de: 'Alle Status', en: 'All Statuses' },
    ...Object.entries(RELEASE_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
  ];

  const setFilterAndResetPage = (setter) => (value) => {
    setter(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  // Columns
  const columns = useMemo(() => [
    {
      accessorKey: 'date',
      header: de ? 'Datum' : 'Date',
      size: 100,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'technicianId',
      header: de ? 'Techniker' : 'Technician',
      size: 150,
      Cell: ({ row }) => {
        const tech = row.original.technicianId;
        const name = typeof tech === 'object' && tech
          ? `${tech.firstName ?? ''} ${tech.lastName ?? ''}`.trim()
          : null;
        return <span className="text-sm">{name || '—'}</span>;
      },
    },
    {
      accessorKey: 'orderId',
      header: de ? 'Auftrag' : 'Order',
      size: 140,
      Cell: ({ row }) => {
        const o = row.original.orderId;
        const label = typeof o === 'object' && o
          ? (o.assignmentNumber ? `#${o.assignmentNumber}` : o.title || '—')
          : '—';
        return <span className="font-mono text-xs text-muted-foreground">{label}</span>;
      },
    },
    {
      accessorKey: 'activityType',
      header: de ? 'Tätigkeit' : 'Activity',
      size: 120,
      Cell: ({ row }) => {
        const cfg = ACTIVITY_TYPE_LABELS[row.original.activityType];
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
            {cfg ? (de ? cfg.label : cfg.labelEn) : row.original.activityType || '—'}
          </span>
        );
      },
    },
    {
      id: 'timeRange',
      header: de ? 'Zeitspanne' : 'Time Range',
      size: 120,
      Cell: ({ row }) => {
        const s = fmtTime(row.original.startTime);
        const e = fmtTime(row.original.endTime);
        if (!s && !e) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="text-xs font-mono">{s ?? '?'} → {e ?? '?'}</span>;
      },
    },
    {
      accessorKey: 'netDurationMin',
      header: de ? 'Netto' : 'Net',
      size: 80,
      Cell: ({ row }) => {
        const min = row.original.netDurationMin ?? row.original.net_duration_min ?? 0;
        return <span className="text-xs font-mono font-semibold">{fmtDuration(min)}</span>;
      },
    },
    {
      accessorKey: 'releaseStatus',
      header: de ? 'Freigabe' : 'Release',
      size: 115,
      Cell: ({ row }) => <FieldOpsTimeStatusBadge status={row.original.releaseStatus} size="sm" />,
    },
    {
      id: 'actions',
      header: '',
      size: 52,
      Cell: ({ row }) => {
        const entry = row.original;
        const isPending = entry.releaseStatus === 'PENDING';
        const isLocked = entry.releaseStatus === 'LOCKED';
        return (
          <RowActionsMenu
            items={[
              {
                label: de ? 'Anzeigen' : 'View',
                icon: Eye,
                onSelect: () => { setSelectedEntry(entry); setPanelOpen(true); },
              },
              {
                label: de ? 'Bearbeiten' : 'Edit',
                icon: Pencil,
                onSelect: () => setEditTarget(entry),
              },
              { type: 'separator', hidden: !isPending && !isLocked },
              {
                label: de ? 'Freigeben' : 'Release',
                icon: Unlock,
                hidden: !isPending,
                onSelect: () => releaseMutate(entry._id || entry.id),
              },
              {
                label: de ? 'Überschreiben' : 'Override',
                icon: ShieldAlert,
                hidden: !isLocked,
                onSelect: () => setOverrideTarget(entry._id || entry.id),
              },
              { type: 'separator' },
              {
                label: de ? 'Löschen' : 'Delete',
                icon: Trash2,
                destructive: true,
                onSelect: () => setDeleteTarget(entry),
              },
            ]}
          />
        );
      },
    },
  ], [de, releaseMutate]);

  return (
    <div className="space-y-6">
      {!compact && (
        <PageHeader
          title={t('fieldOps.time.title', 'Time Entries')}
          description={t('fieldOps.time.desc', 'Release and manage time entries.')}
          count={filtered.length}
        >
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={(event) => setFilterAndResetPage(setSearchFilter)(event.target.value)}
                placeholder={de ? 'Suchen...' : 'Search...'}
                className="h-8 rounded-full border-dashed bg-muted/30 pl-9 text-xs"
              />
            </div>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="h-8 w-40 text-xs rounded-full border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{de ? o.de : o.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs rounded-full border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{de ? o.de : o.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {de ? 'Neuer Eintrag' : 'New Entry'}
            </Button>
          </div>
        </PageHeader>
      )}

      {compact && (
        <div className="rounded-xl border border-border/60 bg-card/70 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="grid gap-2 md:flex md:flex-1 md:items-center">
            <div className="relative md:max-w-xs md:flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={(event) => setFilterAndResetPage(setSearchFilter)(event.target.value)}
                placeholder={de ? 'Zeiteintraege suchen...' : 'Search time records...'}
                className="h-9 rounded-lg bg-background/70 pl-9 text-sm"
              />
            </div>
            <Select value={activityFilter} onValueChange={setFilterAndResetPage(setActivityFilter)}>
              <SelectTrigger className="h-8 w-full text-xs md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{de ? o.de : o.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setFilterAndResetPage(setStatusFilter)}>
              <SelectTrigger className="h-8 w-full text-xs md:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{de ? o.de : o.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {de ? 'Neuer Eintrag' : 'New Entry'}
          </Button>
          </div>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={de ? 'Gesamt' : 'Total'} value={stats.total} colorClass="text-foreground" />
          <StatCard label={de ? 'Ausstehend' : 'Pending'} value={stats.pending} colorClass="text-amber-600" />
          <StatCard label={de ? 'Freigegeben' : 'Released'} value={stats.released} colorClass="text-emerald-600" />
          <StatCard label={de ? 'Gesperrt' : 'Locked'} value={stats.locked} colorClass="text-red-600" />
        </div>
      )}

      {/* Create dialog */}
      <FieldOpsTimeFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSave={handleCreate}
        isLoading={createEntry.isPending}
      />

      {/* Edit dialog */}
      <FieldOpsTimeFormDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        onSave={handleUpdate}
        isLoading={updateEntry.isPending}
        defaultValues={editTarget}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={de ? 'Zeiteintrag löschen' : 'Delete Time Entry'}
        description={de
          ? 'Dieser Zeiteintrag wird unwiderruflich gelöscht.'
          : 'This time entry will be permanently deleted.'}
        onConfirm={handleDelete}
        isLoading={deleteEntry.isPending}
        variant="destructive"
        confirmText={de ? 'Löschen' : 'Delete'}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selectedIds.length} Einträge löschen` : `Delete ${selectedIds.length} Entries`}
        description={de
          ? `${selectedIds.length} Zeiteinträge werden unwiderruflich gelöscht.`
          : `${selectedIds.length} time entries will be permanently deleted.`}
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
        variant="destructive"
        confirmText={de ? 'Alle löschen' : 'Delete All'}
      />

      {/* Release batch dialog */}
      <FieldOpsTimeReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        count={pendingSelectedIds.length}
        onConfirm={() => releaseBatch.mutate(pendingSelectedIds)}
        isLoading={releaseBatch.isPending}
      />

      {/* Override dialog */}
      <FieldOpsTimeOverrideDialog
        open={!!overrideTarget}
        onOpenChange={(v) => { if (!v) setOverrideTarget(null); }}
        onConfirm={(justification) => override.mutate({ id: overrideTarget, justification })}
        isLoading={override.isPending}
      />

      {/* Table */}
      <DataTableShell
        columns={columns}
        data={filtered}
        isLoading={isFetching && entries.length === 0}
        manualPagination={false}
        manualSorting={false}
        enableGlobalFilter={false}
        pagination={pagination}
        onPaginationChange={setPagination}
        rowCount={filtered.length}
        onRowClick={(row) => { setSelectedEntry(row); setPanelOpen(true); }}
        emptyState={<TimeEmptyState de={de} />}
        getRowId={getEntryRowId}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />

      {/* Bulk actions bar */}
      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        {pendingSelectedIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setReleaseOpen(true)}
            disabled={releaseBatch.isPending}
          >
            <Unlock className="h-3.5 w-3.5" />
            {de
              ? `${pendingSelectedIds.length} freigeben`
              : `Release ${pendingSelectedIds.length}`}
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {de ? `${selectedIds.length} löschen` : `Delete ${selectedIds.length}`}
        </Button>
      </BulkActionsBar>

      {/* Detail panel */}
      <FieldOpsTimeDetailPanel
        entry={selectedEntry}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedEntry(null); }}
        onEdit={(entry) => { setPanelOpen(false); setEditTarget(entry); }}
        onRelease={(id) => release.mutate(id)}
        onOverride={(id) => setOverrideTarget(id)}
        onDelete={(entry) => setDeleteTarget(entry)}
        isReleasePending={release.isPending}
        isOverridePending={override.isPending}
      />
    </div>
  );
}
