'use client';

import { useState, useMemo, useCallback } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, FileCheck, Pencil, Plus, Trash2, XCircle, Eye } from 'lucide-react';
import { useFieldOpsAllReports } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsReportMutations } from '@/modules/field-ops/hooks/use-field-ops-report-mutations';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsReportDetailPanel } from './field-ops-report-detail-panel';
import { FieldOpsRejectDialog } from './field-ops-report-action-dialog';
import { FieldOpsCreateReportDialog } from './field-ops-create-report-dialog';
import { REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// ── Animated empty state ──────────────────────────────────────────────────────

function ReportsEmptyState({ de }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/15" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <FileCheck className="h-7 w-7 text-primary animate-bounce" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">
          {de ? 'Keine Berichte gefunden' : 'No reports found'}
        </p>
        <p className="text-xs text-muted-foreground">
          {de
            ? 'Berichte erscheinen hier, sobald Techniker sie einreichen.'
            : 'Reports will appear here once technicians submit them.'}
        </p>
      </div>
    </div>
  );
}

// ── Archived badge ────────────────────────────────────────────────────────────

function ArchivedBadge({ de }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
      <Archive className="h-2.5 w-2.5" />
      {de ? 'Archiv' : 'Archived'}
    </span>
  );
}

// ── Main table component ──────────────────────────────────────────────────────

export function FieldOpsReportsTable() {
  const { t, locale: language } = useLanguage();
  const de = language === 'de';

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  // UI state
  const [selectedReport, setSelectedReport] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rowSelection, setRowSelection] = useState({});

  // Queries
  const filters = useMemo(() => {
    const f = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (showArchived) f.includeArchived = true;
    return f;
  }, [statusFilter, showArchived]);

  const { data: reports = [], isFetching } = useFieldOpsAllReports(filters);

  // Derived selection
  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k),
    [rowSelection],
  );

  // Mutations
  const {
    createReport, approve, reject, updateReport, deleteReport, bulkDelete,
    archiveReport, unarchiveReport, bulkArchive,
  } = useFieldOpsReportMutations({
    onCreate: () => setShowCreate(false),
    onApprove: () => setApproveTarget(null),
    onReject: () => setRejectTarget(null),
    onDelete: () => setDeleteTarget(null),
    onBulkDelete: () => { setRowSelection({}); setBulkDeleteOpen(false); },
    onBulkArchive: () => { setRowSelection({}); setBulkArchiveOpen(false); },
  });

  // Handlers
  const handleCreate = useCallback(({ orderId, payload }) => {
    createReport.mutate({ orderId, payload });
  }, [createReport]);

  const handleUpdate = useCallback(({ payload }) => {
    if (!editTarget) return;
    updateReport.mutate(
      { reportId: editTarget._id, data: payload, orderId: editTarget.orderId?._id || editTarget.orderId },
      { onSuccess: () => setEditTarget(null) },
    );
  }, [editTarget, updateReport]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteReport.mutate({ reportId: deleteTarget._id, orderId: deleteTarget.orderId?._id || deleteTarget.orderId });
  }, [deleteTarget, deleteReport]);

  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(selectedIds);
  }, [selectedIds, bulkDelete]);

  const handleBulkArchive = useCallback(() => {
    bulkArchive.mutate(selectedIds);
  }, [selectedIds, bulkArchive]);

  // Status filter options
  const STATUS_OPTS = [
    { value: 'all', de: 'Alle Status', en: 'All Statuses' },
    ...Object.entries(REPORT_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
  ];

  // Columns
  const columns = useMemo(() => [
    {
      accessorKey: 'reportNumber',
      header: de ? 'Bericht-Nr.' : 'Report #',
      size: 120,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.reportNumber || '—'}
          </span>
          {row.original.isArchived && <ArchivedBadge de={de} />}
        </div>
      ),
    },
    {
      accessorKey: 'orderId',
      header: de ? 'Auftrag' : 'Order',
      size: 140,
      Cell: ({ row }) => {
        const order = row.original.orderId;
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {typeof order === 'object'
              ? (order?.assignmentNumber ? `#${order.assignmentNumber}` : order?.title || '—')
              : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'technicianId',
      header: de ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => {
        const tech = row.original.technicianId;
        return (
          <span className="text-sm">
            {typeof tech === 'object'
              ? `${tech?.firstName ?? ''} ${tech?.lastName ?? ''}`.trim() || '—'
              : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'reportDate',
      header: de ? 'Datum' : 'Date',
      size: 110,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.reportDate)}</span>,
    },
    {
      accessorKey: 'workPerformed',
      header: de ? 'Arbeiten' : 'Work Performed',
      size: 240,
      Cell: ({ row }) => {
        const text = (row.original.workPerformed || '').replace(/<[^>]*>/g, '').trim();
        return (
          <span className="text-xs text-muted-foreground truncate block max-w-[220px]">
            {text.slice(0, 90)}{text.length > 90 ? '…' : ''}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ row }) => <FieldOpsReportStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'materialItems',
      header: de ? 'Material' : 'Materials',
      size: 80,
      Cell: ({ row }) => (
        <span className={cn('text-xs', (row.original.materialItems?.length || 0) > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {(row.original.materialItems || []).length}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 52,
      Cell: ({ row }) => {
        const report = row.original;
        const orderId = report.orderId?._id || report.orderId;
        const isSubmitted = report.status === 'SUBMITTED';
        const isDraftOrSubmitted = report.status === 'DRAFT' || isSubmitted;

        return (
          <RowActionsMenu
            items={[
              {
                label: de ? 'Anzeigen' : 'View',
                icon: Eye,
                onSelect: () => { setSelectedReport(report); setPanelOpen(true); },
              },
              {
                label: de ? 'Bearbeiten' : 'Edit',
                icon: Pencil,
                hidden: !isDraftOrSubmitted,
                onSelect: () => setEditTarget(report),
              },
              { type: 'separator', hidden: !isSubmitted },
              {
                label: de ? 'Genehmigen' : 'Approve',
                icon: CheckCircle2,
                hidden: !isSubmitted,
                onSelect: () => setApproveTarget({ reportId: report._id, orderId }),
              },
              {
                label: de ? 'Ablehnen' : 'Reject',
                icon: XCircle,
                hidden: !isSubmitted,
                destructive: true,
                onSelect: () => setRejectTarget({ reportId: report._id, orderId }),
              },
              { type: 'separator' },
              {
                label: report.isArchived ? (de ? 'Aus Archiv holen' : 'Unarchive') : (de ? 'Archivieren' : 'Archive'),
                icon: report.isArchived ? ArchiveRestore : Archive,
                onSelect: () => report.isArchived
                  ? unarchiveReport.mutate({ reportId: report._id, orderId })
                  : archiveReport.mutate({ reportId: report._id, orderId }),
              },
              { type: 'separator' },
              {
                label: de ? 'Löschen' : 'Delete',
                icon: Trash2,
                destructive: true,
                onSelect: () => setDeleteTarget(report),
              },
            ]}
          />
        );
      },
    },
  ], [de, archiveReport, unarchiveReport]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.reports.title', 'Work Reports')}
        description={t('fieldOps.reports.desc', 'Review and approve submitted reports.')}
        count={reports.length}
      >
        <div className="flex items-center gap-2">
          {/* Archive toggle */}
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs rounded-full"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="h-3.5 w-3.5" />
            {de ? 'Archiv' : 'Archive'}
          </Button>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs rounded-full border-dashed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {de ? o.de : o.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Create */}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {de ? 'Neuer Bericht' : 'New Report'}
          </Button>
        </div>
      </PageHeader>

      {/* Create dialog */}
      <FieldOpsCreateReportDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSave={handleCreate}
        isLoading={createReport.isPending}
      />

      {/* Edit dialog */}
      <FieldOpsCreateReportDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        onSave={handleUpdate}
        isLoading={updateReport.isPending}
        defaultValues={editTarget}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={de ? 'Bericht löschen' : 'Delete Report'}
        description={de
          ? `Bericht "${deleteTarget?.reportNumber || ''}" wird unwiderruflich gelöscht.`
          : `Report "${deleteTarget?.reportNumber || ''}" will be permanently deleted.`}
        onConfirm={handleDelete}
        isLoading={deleteReport.isPending}
        variant="destructive"
        confirmText={de ? 'Löschen' : 'Delete'}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selectedIds.length} Berichte löschen` : `Delete ${selectedIds.length} Reports`}
        description={de
          ? `${selectedIds.length} Berichte werden unwiderruflich gelöscht.`
          : `${selectedIds.length} reports will be permanently deleted.`}
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
        variant="destructive"
        confirmText={de ? 'Alle löschen' : 'Delete All'}
      />

      {/* Bulk archive confirm */}
      <ConfirmDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={de ? `${selectedIds.length} Berichte archivieren` : `Archive ${selectedIds.length} Reports`}
        description={de
          ? `${selectedIds.length} Berichte werden archiviert und aus der Standardansicht ausgeblendet.`
          : `${selectedIds.length} reports will be archived and hidden from the default view.`}
        onConfirm={handleBulkArchive}
        isLoading={bulkArchive.isPending}
        variant="default"
        confirmText={de ? 'Archivieren' : 'Archive'}
      />

      {/* Approve single confirm */}
      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(v) => { if (!v) setApproveTarget(null); }}
        title={de ? 'Bericht genehmigen?' : 'Approve Report?'}
        description={de ? 'Dieser Bericht wird als genehmigt markiert.' : 'This report will be marked as approved.'}
        confirmText={de ? 'Genehmigen' : 'Approve'}
        variant="default"
        onConfirm={() => approve.mutate(approveTarget)}
        isLoading={approve.isPending}
      />

      {/* Reject single */}
      <FieldOpsRejectDialog
        open={!!rejectTarget}
        onOpenChange={(v) => { if (!v) setRejectTarget(null); }}
        onConfirm={(note) => reject.mutate({ ...rejectTarget, rejectionNote: note })}
        isLoading={reject.isPending}
      />

      <DataTableShell
        columns={columns}
        data={reports}
        isLoading={isFetching && reports.length === 0}
        onRowClick={(row) => { setSelectedReport(row); setPanelOpen(true); }}
        emptyState={<ReportsEmptyState de={de} />}
        getRowId={(row) => row._id || row.id}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />

      {/* Bulk actions bar */}
      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setBulkArchiveOpen(true)}
          disabled={bulkArchive.isPending}
        >
          <Archive className="h-3.5 w-3.5" />
          {de ? `${selectedIds.length} archivieren` : `Archive ${selectedIds.length}`}
        </Button>
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
      <FieldOpsReportDetailPanel
        report={selectedReport}
        orderId={selectedReport?.orderId?._id || selectedReport?.orderId}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedReport(null); }}
        onEdit={(report) => { setPanelOpen(false); setEditTarget(report); }}
      />
    </div>
  );
}
