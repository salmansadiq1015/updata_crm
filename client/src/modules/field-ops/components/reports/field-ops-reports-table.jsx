'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Archive,
  ArchiveRestore,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileDown,
  FileCheck,
  Filter,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useFieldOpsAllReports, useFieldOpsReportSummary } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsReportMutations } from '@/modules/field-ops/hooks/use-field-ops-report-mutations';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsReportDetailPanel } from './field-ops-report-detail-panel';
import { FieldOpsRejectDialog } from './field-ops-report-action-dialog';
import { FieldOpsCreateReportDialog } from './field-ops-create-report-dialog';
import { FieldOpsReportImportDialog } from './field-ops-report-import-dialog';
import { REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// ── Animated empty state ──────────────────────────────────────────────────────

function ReportsEmptyState({ t }) {
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
          {t('fieldOps.reports.emptyTitle', 'No reports found')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('fieldOps.reports.emptyHint', 'Reports will appear here once technicians submit them.')}
        </p>
      </div>
    </div>
  );
}

// ── Archived badge ────────────────────────────────────────────────────────────

function ArchivedBadge({ t }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
      <Archive className="h-2.5 w-2.5" />
      {t('fieldOps.reports.archivedBadge', 'Archived')}
    </span>
  );
}

// ── Main table component ──────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
  { type: 'reports', labelKey: 'fieldOps.reports.export.reports', descriptionKey: 'fieldOps.reports.export.reportsDescription' },
  { type: 'payroll', labelKey: 'fieldOps.reports.export.payroll', descriptionKey: 'fieldOps.reports.export.payrollDescription' },
  { type: 'controlling', labelKey: 'fieldOps.reports.export.controlling', descriptionKey: 'fieldOps.reports.export.controllingDescription' },
  { type: 'invoicing', labelKey: 'fieldOps.reports.export.invoicing', descriptionKey: 'fieldOps.reports.export.invoicingDescription' },
];

const SERVER_SORT_FIELDS = {
  reportNumber: 'reportNumber',
  reportDate: 'reportDate',
  status: 'status',
};

const METRIC_TONES = {
  violet: {
    shell: 'from-violet-500/15 via-primary/10 to-transparent shadow-[0_18px_50px_rgba(124,58,237,0.16)]',
    icon: 'bg-violet-500/15 text-violet-300 ring-violet-400/20',
  },
  sky: {
    shell: 'from-sky-500/15 via-cyan-500/10 to-transparent shadow-[0_18px_50px_rgba(14,165,233,0.14)]',
    icon: 'bg-sky-500/15 text-sky-300 ring-sky-400/20',
  },
  emerald: {
    shell: 'from-emerald-500/15 via-teal-500/10 to-transparent shadow-[0_18px_50px_rgba(16,185,129,0.13)]',
    icon: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/20',
  },
  amber: {
    shell: 'from-amber-500/15 via-orange-500/10 to-transparent shadow-[0_18px_50px_rgba(245,158,11,0.13)]',
    icon: 'bg-amber-500/15 text-amber-300 ring-amber-400/20',
  },
};

function SummaryMetric({ icon: Icon, label, value, sub, tone = 'violet', accent }) {
  const styles = METRIC_TONES[tone] || METRIC_TONES.violet;
  return (
    <div className={cn(
      'group relative min-h-[116px] overflow-hidden rounded-lg border border-border/60 bg-card/90 bg-gradient-to-br p-4 ring-1 ring-foreground/[0.03] transition-all duration-200 hover:-translate-y-0.5',
      styles.shell,
    )}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.14),transparent_42%)] opacity-70 transition-opacity group-hover:opacity-100" />
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          </div>
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg ring-1', styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="flex min-h-5 items-center justify-between gap-2">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {accent && <span className="text-xs font-medium text-foreground">{accent}</span>}
        </div>
      </div>
    </div>
  );
}

function ReportCommandHeader({
  t,
  title,
  description,
  totalReports,
  submitted,
  approved,
  invoiced,
  showArchived,
  statusFilter,
  statusOptions,
  exportPending,
  onToggleArchived,
  onStatusChange,
  onExport,
  onImport,
  onCreate,
}) {
  return (
    <section className="relative overflow-hidden rounded-lg border border-border/60 bg-card px-5 py-5 shadow-[0_20px_70px_rgba(2,6,23,0.20)] ring-1 ring-foreground/[0.03]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-sky-500/5 to-emerald-500/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {t('fieldOps.reports.managementBadge', 'Report Management')}
            </Badge>
            <Badge variant="outline">{t('fieldOps.reports.totalBadge', '{count} total', { count: totalReports })}</Badge>
            {showArchived && (
              <Badge variant="secondary" className="gap-1">
                <Archive className="h-3 w-3" />
                {t('fieldOps.reports.archiveVisible', 'Archive visible')}
              </Badge>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-[28px]">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              {t('fieldOps.reports.awaitingApproval', '{count} awaiting approval', { count: submitted })}
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {t('fieldOps.reports.billingReady', '{count} billing-ready', { count: approved })}
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 text-xs text-muted-foreground">
              <ReceiptText className="h-3.5 w-3.5 text-sky-400" />
              {t('fieldOps.reports.invoicedCount', '{count} invoiced', { count: invoiced })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={onToggleArchived}
          >
            <Archive className="h-3.5 w-3.5" />
            {t('fieldOps.reports.archive', 'Archive')}
          </Button>

          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="h-9 w-40 border-border/70 bg-background/70 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey, option.fallback)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onImport}>
            <UploadCloud className="h-3.5 w-3.5" />
            {t('fieldOps.reports.importAction', 'Import')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={exportPending}>
                <FileDown className="h-3.5 w-3.5" />
                {t('fieldOps.reports.exportAction', 'Export')}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{t('fieldOps.reports.csvExport', 'CSV Export')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {EXPORT_OPTIONS.map((option) => (
                <DropdownMenuItem key={option.type} className="items-start gap-2 py-2" onSelect={() => onExport(option.type)}>
                  <Download className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{t(option.labelKey, option.type)}</span>
                    <span className="text-xs text-muted-foreground">{t(option.descriptionKey, '')}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" className="h-9 gap-1.5 shadow-[0_0_24px_hsl(var(--primary)/0.28)]" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {t('fieldOps.reports.newReport', 'New Report')}
          </Button>
        </div>
      </div>
    </section>
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

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
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
  const { t } = useLanguage();

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
  const [sorting, setSorting] = useState([]);

  // UI state
  const [selectedReport, setSelectedReport] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const debouncedSearchFilter = useDebounce(searchFilter, 300).trim();
  const serverSort = useMemo(() => {
    const activeSort = sorting[0];
    const sortBy = SERVER_SORT_FIELDS[activeSort?.id];
    if (!sortBy) return {};
    return {
      sortBy,
      sortOrder: activeSort.desc ? 'desc' : 'asc',
    };
  }, [sorting]);

  const baseFilters = useMemo(() => {
    const f = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (showArchived) f.includeArchived = true;
    if (debouncedSearchFilter) f.search = debouncedSearchFilter;
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    if (isObjectIdLike(technicianFilter)) f.technicianId = technicianFilter;
    if (isObjectIdLike(projectFilter)) f.projectId = projectFilter;
    if (isObjectIdLike(customerFilter)) f.customerId = customerFilter;
    Object.assign(f, serverSort);
    return f;
  }, [statusFilter, showArchived, debouncedSearchFilter, dateFrom, dateTo, technicianFilter, projectFilter, customerFilter, serverSort]);

  const filters = useMemo(() => ({
    ...baseFilters,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  }), [baseFilters, pagination]);

  const { data: reportsResult, isFetching, isError, error, refetch } = useFieldOpsAllReports(filters);
  const {
    data: summary,
    isError: summaryIsError,
    error: summaryError,
    refetch: refetchSummary,
  } = useFieldOpsReportSummary(baseFilters);
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
    archiveReport, unarchiveReport, bulkArchive, createInvoice, exportReports, importReports, downloadImportTemplate,
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

  const handleSortingChange = useCallback((next) => {
    setSorting((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      return Array.isArray(resolved) ? resolved.slice(0, 1) : [];
    });
    resetPage();
  }, [resetPage]);

  const retryReportQueries = useCallback(() => {
    refetch();
    refetchSummary();
  }, [refetch, refetchSummary]);

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
    { value: 'all', labelKey: 'fieldOps.reports.allStatuses', fallback: 'All Statuses' },
    ...Object.entries(REPORT_STATUS_CONFIG).map(([value, config]) => ({
      value,
      labelKey: `fieldOps.reports.status.${value}`,
      fallback: config.labelEn,
    })),
  ];

  // Columns
  const columns = useMemo(() => [
    {
      accessorKey: 'reportNumber',
      header: t('fieldOps.reports.table.reportNumber', 'Report #'),
      size: 120,
      enableSorting: true,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.reportNumber || '—'}
          </span>
          {row.original.isArchived && <ArchivedBadge t={t} />}
        </div>
      ),
    },
    {
      accessorKey: 'orderId',
      header: t('fieldOps.reports.table.order', 'Assignment'),
      size: 140,
      enableSorting: false,
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
      header: t('fieldOps.reports.table.customer', 'Customer'),
      size: 160,
      enableSorting: false,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
          {getReportContext(row.original).customerName}
        </span>
      ),
    },
    {
      id: 'project',
      header: t('fieldOps.reports.table.project', 'Project'),
      size: 160,
      enableSorting: false,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
          {getReportContext(row.original).projectName}
        </span>
      ),
    },
    {
      accessorKey: 'technicianId',
      header: t('fieldOps.reports.table.technician', 'Technician'),
      size: 160,
      enableSorting: false,
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
      header: t('fieldOps.reports.table.date', 'Date'),
      size: 110,
      enableSorting: true,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.reportDate)}</span>,
    },
    {
      accessorKey: 'workPerformed',
      header: t('fieldOps.reports.table.workPerformed', 'Work Performed'),
      size: 240,
      enableSorting: false,
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
      header: t('fieldOps.reports.table.status', 'Status'),
      size: 130,
      enableSorting: true,
      Cell: ({ row }) => <FieldOpsReportStatusBadge status={row.original.status} size="sm" />,
    },
    {
      id: 'hours',
      header: t('fieldOps.reports.table.hours', 'Hours'),
      size: 110,
      enableSorting: false,
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
      header: t('fieldOps.reports.table.materials', 'Materials'),
      size: 80,
      enableSorting: false,
      Cell: ({ row }) => (
        <span className={cn('text-xs', (row.original.materialItems?.length || 0) > 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {(row.original.materialItems || []).length}
        </span>
      ),
    },
    {
      id: 'invoice',
      header: t('fieldOps.reports.table.invoice', 'Invoice'),
      size: 110,
      enableSorting: false,
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
      enableSorting: false,
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
                label: t('fieldOps.reports.actions.view', 'View'),
                icon: Eye,
                onSelect: () => { setSelectedReport(report); setPanelOpen(true); },
              },
              {
                label: t('fieldOps.reports.actions.edit', 'Edit'),
                icon: Pencil,
                hidden: !isDraftOrSubmitted,
                onSelect: () => setEditTarget(report),
              },
              { type: 'separator', hidden: !isSubmitted },
              {
                label: t('fieldOps.reports.approve', 'Approve'),
                icon: CheckCircle2,
                hidden: !isSubmitted,
                onSelect: () => setApproveTarget({ reportId, orderId }),
              },
              {
                label: t('fieldOps.reports.reject', 'Reject'),
                icon: XCircle,
                hidden: !isSubmitted,
                destructive: true,
                onSelect: () => setRejectTarget({ reportId, orderId }),
              },
              { type: 'separator', hidden: !isApproved },
              {
                label: t('fieldOps.reports.actions.createInvoice', 'Create Invoice'),
                icon: ReceiptText,
                hidden: !isApproved,
                onSelect: () => createInvoice.mutate({ reportId, orderId }),
              },
              { type: 'separator' },
              {
                label: report.isArchived
                  ? t('fieldOps.reports.actions.unarchive', 'Unarchive')
                  : t('fieldOps.reports.actions.archive', 'Archive'),
                icon: report.isArchived ? ArchiveRestore : Archive,
                onSelect: () => report.isArchived
                  ? unarchiveReport.mutate({ reportId, orderId })
                  : archiveReport.mutate({ reportId, orderId }),
              },
              { type: 'separator' },
              {
                label: t('fieldOps.reports.actions.delete', 'Delete'),
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
  ], [t, archiveReport, unarchiveReport, createInvoice]);

  return (
    <div className="space-y-5">
      <ReportCommandHeader
        t={t}
        title={t('fieldOps.reports.title', 'Work Reports')}
        description={t('fieldOps.reports.managementDescription', 'Control submitted work, time, materials, approvals, and billing handoff from one operations workspace.')}
        totalReports={totalReports}
        submitted={summary?.totals?.submitted ?? 0}
        approved={summary?.totals?.approved ?? 0}
        invoiced={summary?.totals?.invoiced ?? 0}
        showArchived={showArchived}
        statusFilter={statusFilter}
        statusOptions={STATUS_OPTS}
        exportPending={exportReports.isPending}
        onToggleArchived={toggleArchived}
        onStatusChange={updateStatusFilter}
        onExport={handleExport}
        onImport={() => setShowImport(true)}
        onCreate={() => setShowCreate(true)}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          icon={BarChart3}
          label={t('fieldOps.reports.metrics.reports', 'Reports')}
          value={summary?.totals?.reports ?? totalReports}
          tone="violet"
          sub={t('fieldOps.reports.metrics.reportsSub', 'Approved {approved} · Invoiced {invoiced}', {
            approved: summary?.totals?.approved ?? 0,
            invoiced: summary?.totals?.invoiced ?? 0,
          })}
        />
        <SummaryMetric
          icon={Clock}
          label={t('fieldOps.reports.metrics.workingTime', 'Working Time')}
          value={formatHours(summary?.totals?.totalMinutes)}
          tone="sky"
          sub={t('fieldOps.reports.metrics.workingTimeSub', 'Billable {billable} · Non-billable {nonBillable}', {
            billable: formatHours(summary?.totals?.billableMinutes),
            nonBillable: formatHours(summary?.totals?.nonBillableMinutes),
          })}
        />
        <SummaryMetric
          icon={FileCheck}
          label={t('fieldOps.reports.metrics.submitted', 'Submitted')}
          value={summary?.totals?.submitted ?? 0}
          tone="emerald"
          sub={t('fieldOps.reports.metrics.submittedSub', 'Draft {draft} · Rejected {rejected}', {
            draft: summary?.totals?.draft ?? 0,
            rejected: summary?.totals?.rejected ?? 0,
          })}
        />
        <SummaryMetric
          icon={ReceiptText}
          label={t('fieldOps.reports.metrics.materialItems', 'Material Items')}
          value={summary?.totals?.materialItems ?? 0}
          tone="amber"
          sub={t('fieldOps.reports.metrics.materialItemsSub', 'From open and approved reports')}
        />
      </div>

      <div className="rounded-lg border border-border/60 bg-card/80 p-3 shadow-theme-sm ring-1 ring-foreground/[0.03]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            <Filter className="h-3.5 w-3.5 text-primary" />
            {t('fieldOps.reports.filters.title', 'Filters')}
          </div>
          <span className="text-xs text-muted-foreground">
            {t('fieldOps.reports.filters.matches', '{count} matches', { count: totalReports })}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => updateDateFrom(event.target.value)}
            className="h-9 border-border/70 bg-background/70 text-xs"
            aria-label={t('fieldOps.reports.filters.fromDate', 'From date')}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => updateDateTo(event.target.value)}
            className="h-9 border-border/70 bg-background/70 text-xs"
            aria-label={t('fieldOps.reports.filters.toDate', 'To date')}
          />
          <Select value={technicianFilter} onValueChange={updateTechnicianFilter}>
            <SelectTrigger className="h-9 border-border/70 bg-background/70 text-xs">
              <SelectValue placeholder={t('fieldOps.reports.filters.technician', 'Technician')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fieldOps.reports.filters.allTechnicians', 'All Technicians')}</SelectItem>
              {employeeOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={updateProjectFilter}>
            <SelectTrigger className="h-9 border-border/70 bg-background/70 text-xs">
              <SelectValue placeholder={t('fieldOps.reports.filters.project', 'Project')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fieldOps.reports.filters.allProjects', 'All Projects')}</SelectItem>
              {projectOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={updateCustomerFilter}>
            <SelectTrigger className="h-9 border-border/70 bg-background/70 text-xs">
              <SelectValue placeholder={t('fieldOps.reports.filters.customer', 'Customer')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fieldOps.reports.filters.allCustomers', 'All Customers')}</SelectItem>
              {customerOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(isError || summaryIsError) && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-700 shadow-theme-sm dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {t('fieldOps.reports.loadErrorTitle', 'Reports could not be loaded')}
              </p>
              <p className="text-xs opacity-80">
                {getErrorMessage(error || summaryError, t('fieldOps.reports.loadErrorHint', 'Check the connection and retry.'))}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={retryReportQueries} className="w-fit gap-2 border-red-500/30 bg-background/80">
            <RefreshCw className="h-3.5 w-3.5" />
            {t('fieldOps.reports.retry', 'Retry')}
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <FieldOpsCreateReportDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSave={handleCreate}
        isLoading={createReport.isPending}
      />

      <FieldOpsReportImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        importReports={importReports}
        downloadImportTemplate={downloadImportTemplate}
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
        title={t('fieldOps.reports.deleteTitle', 'Delete Report')}
        description={t('fieldOps.reports.deleteDescription', 'Report "{reportNumber}" will be permanently deleted.', {
          reportNumber: deleteTarget?.reportNumber || '',
        })}
        onConfirm={handleDelete}
        isLoading={deleteReport.isPending}
        variant="destructive"
        confirmText={t('fieldOps.reports.actions.delete', 'Delete')}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t('fieldOps.reports.bulkDeleteTitle', 'Delete {count} Reports', { count: selectedIds.length })}
        description={t('fieldOps.reports.bulkDeleteDescription', '{count} reports will be permanently deleted.', { count: selectedIds.length })}
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
        variant="destructive"
        confirmText={t('fieldOps.reports.deleteAll', 'Delete All')}
      />

      {/* Bulk archive confirm */}
      <ConfirmDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={t('fieldOps.reports.bulkArchiveTitle', 'Archive {count} Reports', { count: selectedIds.length })}
        description={t('fieldOps.reports.bulkArchiveDescription', '{count} reports will be archived and hidden from the default view.', { count: selectedIds.length })}
        onConfirm={handleBulkArchive}
        isLoading={bulkArchive.isPending}
        variant="default"
        confirmText={t('fieldOps.reports.actions.archive', 'Archive')}
      />

      {/* Approve single confirm */}
      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(v) => { if (!v) setApproveTarget(null); }}
        title={t('fieldOps.reports.approveConfirm', 'Approve Report?')}
        description={t('fieldOps.reports.approveDescription', 'This report will be marked as approved.')}
        confirmText={t('fieldOps.reports.approve', 'Approve')}
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
        sorting={sorting}
        onSortingChange={handleSortingChange}
        globalFilter={searchFilter}
        onGlobalFilterChange={updateSearchFilter}
        onRowClick={(row) => { setSelectedReport(row); setPanelOpen(true); }}
        emptyState={<ReportsEmptyState t={t} />}
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
          {t('fieldOps.reports.bulkArchiveAction', 'Archive {count}', { count: selectedIds.length })}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('fieldOps.reports.bulkDeleteAction', 'Delete {count}', { count: selectedIds.length })}
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
