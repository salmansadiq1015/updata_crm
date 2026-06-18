'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useFieldOpsAllReports, useFieldOpsReportSummary } from '@/modules/field-ops/hooks/use-field-ops-queries';
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
import { Input } from '@/components/ui/input';
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

function SummaryMetric({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function getReportId(report) {
  return report?._id || report?.id;
}

function getOrderId(report) {
  return report?.orderId?._id || report?.orderId || report?.order_id;
}

function isObjectIdLike(value) {
  return /^[a-f\d]{24}$/i.test(`${value || ''}`);
}

function formatHours(minutes) {
  const hours = Math.round((Number(minutes || 0) / 60) * 100) / 100;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;
}

function deriveMinutes(report) {
  const explicit = Number(report?.billableMinutes || 0) + Number(report?.nonBillableMinutes || 0);
  if (explicit > 0) return explicit;
  if (!report?.arrivalTime || !report?.departureTime) return 0;
  const start = new Date(report.arrivalTime).getTime();
  const end = new Date(report.departureTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

function getReportContext(report) {
  const assignment = typeof report?.orderId === 'object' ? report.orderId : null;
  const qopOrder = typeof assignment?.orderId === 'object' ? assignment.orderId : null;
  const project = typeof report?.projectId === 'object'
    ? report.projectId
    : typeof assignment?.projectId === 'object'
      ? assignment.projectId
      : null;
  const customer = typeof assignment?.customerId === 'object' ? assignment.customerId : null;
  return {
    assignmentLabel: assignment?.assignmentNumber ? `#${assignment.assignmentNumber}` : assignment?.title || '—',
    projectName: project?.name || qopOrder?.title || '—',
    customerName: customer?.name || qopOrder?.customerName || '—',
    invoiceLabel: report?.invoiceId?.invoiceNumber || report?.invoiceReference || '—',
  };
}

export function FieldOpsReportsTable() {
  const { t, locale: language } = useLanguage();
  const de = language === 'de';

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

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

  const baseFilters = useMemo(() => {
    const f = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (showArchived) f.includeArchived = true;
    if (searchFilter.trim()) f.search = searchFilter.trim();
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    if (isObjectIdLike(technicianFilter)) f.technicianId = technicianFilter;
    if (isObjectIdLike(projectFilter)) f.projectId = projectFilter;
    if (isObjectIdLike(customerFilter)) f.customerId = customerFilter;
    return f;
  }, [statusFilter, showArchived, searchFilter, dateFrom, dateTo, technicianFilter, projectFilter, customerFilter]);

  const filters = useMemo(() => ({
    ...baseFilters,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  }), [baseFilters, pagination]);

  const { data: reportsResult, isFetching } = useFieldOpsAllReports(filters);
  const { data: summary } = useFieldOpsReportSummary(baseFilters);
  const reports = reportsResult?.data || [];
  const paginationMeta = reportsResult?.pagination;
  const totalReports = paginationMeta?.total ?? reports.length;

  const employeeOptions = useMemo(
    () => (summary?.byEmployee || []).filter((item) => isObjectIdLike(item.id)),
    [summary],
  );
  const projectOptions = useMemo(
    () => (summary?.byProject || []).filter((item) => isObjectIdLike(item.id)),
    [summary],
  );
  const customerOptions = useMemo(
    () => (summary?.byCustomer || []).filter((item) => isObjectIdLike(item.id)),
    [summary],
  );

  // Derived selection
  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k),
    [rowSelection],
  );

  // Mutations
  const {
    createReport, approve, reject, updateReport, deleteReport, bulkDelete,
    archiveReport, unarchiveReport, bulkArchive, createInvoice, exportReports,
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
      { reportId: getReportId(editTarget), data: payload, orderId: getOrderId(editTarget) },
      { onSuccess: () => setEditTarget(null) },
    );
  }, [editTarget, updateReport]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteReport.mutate({ reportId: getReportId(deleteTarget), orderId: getOrderId(deleteTarget) });
  }, [deleteTarget, deleteReport]);

  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(selectedIds);
  }, [selectedIds, bulkDelete]);

  const handleBulkArchive = useCallback(() => {
    bulkArchive.mutate(selectedIds);
  }, [selectedIds, bulkArchive]);

  const handleExport = useCallback((type) => {
    exportReports.mutate({ filters: baseFilters, type });
  }, [baseFilters, exportReports]);

  const handlePaginationChange = useCallback((next) => {
    setPagination((current) => (typeof next === 'function' ? next(current) : next));
  }, []);

  const resetPage = useCallback(() => {
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }));
  }, []);

  const updateStatusFilter = useCallback((value) => {
    setStatusFilter(value);
    resetPage();
  }, [resetPage]);

  const toggleArchived = useCallback(() => {
    setShowArchived((value) => !value);
    resetPage();
  }, [resetPage]);

  const updateSearchFilter = useCallback((value) => {
    setSearchFilter(value);
    resetPage();
  }, [resetPage]);

  const updateDateFrom = useCallback((value) => {
    setDateFrom(value);
    resetPage();
  }, [resetPage]);

  const updateDateTo = useCallback((value) => {
    setDateTo(value);
    resetPage();
  }, [resetPage]);

  const updateTechnicianFilter = useCallback((value) => {
    setTechnicianFilter(value);
    resetPage();
  }, [resetPage]);

  const updateProjectFilter = useCallback((value) => {
    setProjectFilter(value);
    resetPage();
  }, [resetPage]);

  const updateCustomerFilter = useCallback((value) => {
    setCustomerFilter(value);
    resetPage();
  }, [resetPage]);

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
        const context = getReportContext(row.original);
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {context.assignmentLabel}
          </span>
        );
      },
    },
    {
      id: 'customer',
      header: de ? 'Kunde' : 'Customer',
      size: 160,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
          {getReportContext(row.original).customerName}
        </span>
      ),
    },
    {
      id: 'project',
      header: de ? 'Projekt' : 'Project',
      size: 160,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
          {getReportContext(row.original).projectName}
        </span>
      ),
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
      id: 'hours',
      header: de ? 'Stunden' : 'Hours',
      size: 110,
      Cell: ({ row }) => {
        const report = row.original;
        return (
          <div className="text-xs leading-tight">
            <div className="font-medium">{formatHours(deriveMinutes(report))}</div>
            <div className="text-muted-foreground">
              {formatHours(report.billableMinutes)} / {formatHours(report.nonBillableMinutes)}
            </div>
          </div>
        );
      },
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
      id: 'invoice',
      header: de ? 'Rechnung' : 'Invoice',
      size: 110,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {getReportContext(row.original).invoiceLabel}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 52,
      Cell: ({ row }) => {
        const report = row.original;
        const reportId = getReportId(report);
        const orderId = getOrderId(report);
        const isSubmitted = report.status === 'SUBMITTED';
        const isApproved = report.status === 'APPROVED';
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
                onSelect: () => setApproveTarget({ reportId, orderId }),
              },
              {
                label: de ? 'Ablehnen' : 'Reject',
                icon: XCircle,
                hidden: !isSubmitted,
                destructive: true,
                onSelect: () => setRejectTarget({ reportId, orderId }),
              },
              { type: 'separator', hidden: !isApproved },
              {
                label: de ? 'Rechnung erstellen' : 'Create Invoice',
                icon: ReceiptText,
                hidden: !isApproved,
                onSelect: () => createInvoice.mutate({ reportId, orderId }),
              },
              { type: 'separator' },
              {
                label: report.isArchived ? (de ? 'Aus Archiv holen' : 'Unarchive') : (de ? 'Archivieren' : 'Archive'),
                icon: report.isArchived ? ArchiveRestore : Archive,
                onSelect: () => report.isArchived
                  ? unarchiveReport.mutate({ reportId, orderId })
                  : archiveReport.mutate({ reportId, orderId }),
              },
              { type: 'separator' },
              {
                label: de ? 'Löschen' : 'Delete',
                icon: Trash2,
                hidden: !isDraftOrSubmitted,
                destructive: true,
                onSelect: () => setDeleteTarget(report),
              },
            ]}
          />
        );
      },
    },
  ], [de, archiveReport, unarchiveReport, createInvoice]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.reports.title', 'Work Reports')}
        description={t('fieldOps.reports.desc', 'Review and approve submitted reports.')}
        count={totalReports}
      >
        <div className="flex items-center gap-2">
          {/* Archive toggle */}
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs rounded-full"
            onClick={toggleArchived}
          >
            <Archive className="h-3.5 w-3.5" />
            {de ? 'Archiv' : 'Archive'}
          </Button>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={updateStatusFilter}>
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs rounded-full"
            onClick={() => handleExport('payroll')}
            disabled={exportReports.isPending}
          >
            <Download className="h-3.5 w-3.5" />
            Payroll
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs rounded-full"
            onClick={() => handleExport('invoicing')}
            disabled={exportReports.isPending}
          >
            <Download className="h-3.5 w-3.5" />
            {de ? 'Fakturierung' : 'Invoicing'}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {de ? 'Neuer Bericht' : 'New Report'}
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon={BarChart3}
          label={de ? 'Berichte' : 'Reports'}
          value={summary?.totals?.reports ?? totalReports}
          sub={`${de ? 'Genehmigt' : 'Approved'} ${summary?.totals?.approved ?? 0} · ${de ? 'Verrechnet' : 'Invoiced'} ${summary?.totals?.invoiced ?? 0}`}
        />
        <SummaryMetric
          icon={Clock}
          label={de ? 'Arbeitszeit' : 'Working Time'}
          value={formatHours(summary?.totals?.totalMinutes)}
          sub={`${de ? 'Billable' : 'Billable'} ${formatHours(summary?.totals?.billableMinutes)} · ${de ? 'Nicht billable' : 'Non-billable'} ${formatHours(summary?.totals?.nonBillableMinutes)}`}
        />
        <SummaryMetric
          icon={FileCheck}
          label={de ? 'Eingereicht' : 'Submitted'}
          value={summary?.totals?.submitted ?? 0}
          sub={`${de ? 'Entwurf' : 'Draft'} ${summary?.totals?.draft ?? 0} · ${de ? 'Abgelehnt' : 'Rejected'} ${summary?.totals?.rejected ?? 0}`}
        />
        <SummaryMetric
          icon={ReceiptText}
          label={de ? 'Materialpositionen' : 'Material Items'}
          value={summary?.totals?.materialItems ?? 0}
          sub={de ? 'Aus genehmigten und offenen Berichten' : 'From open and approved reports'}
        />
      </div>

      <div className="grid gap-2 rounded-lg border border-border/40 bg-card p-3 md:grid-cols-2 xl:grid-cols-5">
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => updateDateFrom(event.target.value)}
          className="h-9 text-xs"
          aria-label={de ? 'Von Datum' : 'From date'}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => updateDateTo(event.target.value)}
          className="h-9 text-xs"
          aria-label={de ? 'Bis Datum' : 'To date'}
        />
        <Select value={technicianFilter} onValueChange={updateTechnicianFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={de ? 'Techniker' : 'Technician'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{de ? 'Alle Techniker' : 'All Technicians'}</SelectItem>
            {employeeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={updateProjectFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={de ? 'Projekt' : 'Project'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{de ? 'Alle Projekte' : 'All Projects'}</SelectItem>
            {projectOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={customerFilter} onValueChange={updateCustomerFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={de ? 'Kunde' : 'Customer'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{de ? 'Alle Kunden' : 'All Customers'}</SelectItem>
            {customerOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        rowCount={totalReports}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        globalFilter={searchFilter}
        onGlobalFilterChange={updateSearchFilter}
        onRowClick={(row) => { setSelectedReport(row); setPanelOpen(true); }}
        emptyState={<ReportsEmptyState de={de} />}
        getRowId={(row) => getReportId(row)}
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
        orderId={getOrderId(selectedReport)}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedReport(null); }}
        onEdit={(report) => { setPanelOpen(false); setEditTarget(report); }}
      />
    </div>
  );
}
