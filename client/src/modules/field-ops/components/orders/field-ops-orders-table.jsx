'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsOrderMutations } from '@/modules/field-ops/hooks/use-field-ops-order-mutations';
import { FieldOpsOrderFilters } from './field-ops-order-filters';
import { FieldOpsOrdersCommand } from './field-ops-orders-command';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsCreateOrderDialog } from './field-ops-create-order-dialog';
import { FieldOpsOrderImportDialog } from './field-ops-order-import-dialog';
import {
  ORDER_PRIORITY,
  ORDER_STATUS_CONFIG,
  ORDER_TYPE_LABELS,
  REPORT_STATUS_CONFIG,
} from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  computeOrderListMetrics,
  computeStatusSummaryTotal,
  getNextSevenDayRange,
  getOrderDisplayNumber,
  getOrderDocumentCount,
  getOrderEndDate,
  getOrderReportStatus,
  getOrderStartDate,
  isOrderDueToday,
  isOrderOverdue,
  isOrderUnassigned,
} from '@/modules/field-ops/utils/order-management-utils';
import {
  AlertCircle,
  CalendarClock,
  Eye,
  FileText,
  MapPin,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';

const DEFAULT_PAGE_SIZE = 25;
const EMPTY_SUMMARY = Object.freeze({});
const EMPTY_ORDERS = Object.freeze([]);

const PRIORITY_CONFIG = {
  [ORDER_PRIORITY.NORMAL]: {
    label: 'Normal',
    labelEn: 'Normal',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  [ORDER_PRIORITY.HIGH]: {
    label: 'Hoch',
    labelEn: 'High',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
  [ORDER_PRIORITY.URGENT]: {
    label: 'Dringend',
    labelEn: 'Urgent',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
};

function assigneeLabel(order, de) {
  const targetType = order.assignmentTargetType || order.assignment_target_type;
  const targetLabel = order.assignmentTargetLabel || order.assignment_target_label;
  if (targetType && targetType !== 'EMPLOYEE') {
    return targetLabel || targetType;
  }

  const employee = order.employeeId || order.employee_id;
  if (employee && typeof employee === 'object') {
    return `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email;
  }

  return order.employeeName || order.employee_name || (de ? 'Nicht zugewiesen' : 'Unassigned');
}

export function FieldOpsOrdersTable() {
  const { t, locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [priority, setPriority] = useState('all');
  const [employeeId, setEmployeeId] = useState('all');
  const [teamId, setTeamId] = useState('all');
  const [projectId, setProjectId] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [cursorStack, setCursorStack] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [referenceTime] = useState(() => Date.now());

  const debouncedSearch = useDebounce(search, 300);
  const {
    createOrder,
    updateOrder,
    deleteOrder,
    bulkDelete,
    exportOrders,
    importOrders,
    downloadImportTemplate,
  } = useFieldOpsOrderMutations();
  const cursor = cursorStack[cursorStack.length - 1];

  const filters = useMemo(() => {
    const nextFilters = {
      limit: pageSize,
      sortBy: 'startDatetime',
      sortOrder: 'asc',
    };
    if (cursor) nextFilters.cursor = cursor;
    if (debouncedSearch) nextFilters.search = debouncedSearch;
    if (status !== 'all') nextFilters.status = status;
    if (type !== 'all') nextFilters.orderType = type;
    if (priority !== 'all') nextFilters.priority = priority;
    if (employeeId !== 'all') nextFilters.employeeId = employeeId;
    if (teamId !== 'all') nextFilters.teamId = teamId;
    if (projectId !== 'all') nextFilters.projectId = projectId;
    if (dateFrom) nextFilters.dateFrom = dateFrom;
    if (dateTo) nextFilters.dateTo = dateTo;
    return nextFilters;
  }, [cursor, dateFrom, dateTo, debouncedSearch, employeeId, pageSize, priority, projectId, status, teamId, type]);

  const exportFilters = useMemo(() => {
    const nextFilters = { ...filters, limit: 5000 };
    delete nextFilters.cursor;
    return nextFilters;
  }, [filters]);

  const resetPaging = useCallback(() => {
    setCursorStack([]);
    setRowSelection({});
  }, []);

  const { data: ordersPage, isFetching, isError, refetch } = useFieldOpsOrders(filters);
  const orders = ordersPage?.items ?? EMPTY_ORDERS;
  const pagination = ordersPage?.pagination ?? {};
  const summary = ordersPage?.summary ?? EMPTY_SUMMARY;
  const syncTimestamp = ordersPage?.syncTimestamp;
  const summaryTotal = useMemo(() => computeStatusSummaryTotal(summary), [summary]);
  const metricsNow = useMemo(() => {
    const timestamp = syncTimestamp ? new Date(syncTimestamp).getTime() : referenceTime;
    return Number.isNaN(timestamp) ? referenceTime : timestamp;
  }, [referenceTime, syncTimestamp]);
  const orderMetrics = useMemo(
    () => computeOrderListMetrics(orders, metricsNow),
    [metricsNow, orders],
  );

  const clear = useCallback(() => {
    setSearch('');
    setStatus('all');
    setType('all');
    setPriority('all');
    setEmployeeId('all');
    setTeamId('all');
    setProjectId('all');
    setDateFrom('');
    setDateTo('');
    resetPaging();
  }, [resetPaging]);

  const updateSearch = useCallback((value) => {
    setSearch(value);
    resetPaging();
  }, [resetPaging]);

  const updateStatus = useCallback((value) => {
    setStatus(value);
    resetPaging();
  }, [resetPaging]);

  const updateType = useCallback((value) => {
    setType(value);
    resetPaging();
  }, [resetPaging]);

  const updatePriority = useCallback((value) => {
    setPriority(value);
    resetPaging();
  }, [resetPaging]);

  const updateProject = useCallback((value) => {
    setProjectId(value);
    resetPaging();
  }, [resetPaging]);

  const updateDateFrom = useCallback((value) => {
    setDateFrom(value);
    resetPaging();
  }, [resetPaging]);

  const updateDateTo = useCallback((value) => {
    setDateTo(value);
    resetPaging();
  }, [resetPaging]);

  const applyQuickPreset = useCallback((preset) => {
    resetPaging();

    if (preset === 'ALL') {
      setSearch('');
      setStatus('all');
      setType('all');
      setPriority('all');
      setEmployeeId('all');
      setTeamId('all');
      setProjectId('all');
      setDateFrom('');
      setDateTo('');
      return;
    }

    setStatus('all');
    setPriority('all');
    setDateFrom('');
    setDateTo('');

    if (ORDER_STATUS_CONFIG[preset]) {
      setStatus(preset);
      return;
    }

    if (preset === 'URGENT') {
      setPriority(ORDER_PRIORITY.URGENT);
      return;
    }

    if (preset === 'NEXT_7_DAYS') {
      const range = getNextSevenDayRange();
      setDateFrom(range.dateFrom);
      setDateTo(range.dateTo);
    }
  }, [resetPaging]);

  const activePreset = useMemo(() => {
    if (
      !search
      && status === 'all'
      && type === 'all'
      && priority === 'all'
      && employeeId === 'all'
      && teamId === 'all'
      && projectId === 'all'
      && !dateFrom
      && !dateTo
    ) {
      return 'ALL';
    }
    if (status !== 'all' && type === 'all' && priority === 'all' && !dateFrom && !dateTo) return status;
    if (priority === ORDER_PRIORITY.URGENT && status === 'all' && !dateFrom && !dateTo) return 'URGENT';
    const nextSevenDays = getNextSevenDayRange();
    if (status === 'all' && priority === 'all' && dateFrom === nextSevenDays.dateFrom && dateTo === nextSevenDays.dateTo) {
      return 'NEXT_7_DAYS';
    }
    return null;
  }, [dateFrom, dateTo, employeeId, priority, projectId, search, status, teamId, type]);

  const handleEmployeeFilter = useCallback((value) => {
    setEmployeeId(value);
    if (value !== 'all') setTeamId('all');
    resetPaging();
  }, [resetPaging]);

  const handleTeamFilter = useCallback((value) => {
    setTeamId(value);
    if (value !== 'all') setEmployeeId('all');
    resetPaging();
  }, [resetPaging]);

  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, selected]) => selected).map(([id]) => id),
    [rowSelection],
  );

  const columns = useMemo(() => [
    {
      accessorKey: 'assignmentNumber',
      header: de ? 'Auftrag #' : 'Order #',
      size: 170,
      enableSorting: false,
      Cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-mono text-xs font-semibold text-primary">
            {getOrderDisplayNumber(row.original)}
          </span>
          {row.original.title ? (
            <p className="mt-0.5 max-w-[150px] truncate text-xs text-muted-foreground">
              {row.original.title}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'assignmentType',
      header: de ? 'Typ' : 'Type',
      size: 140,
      enableSorting: false,
      Cell: ({ row }) => {
        const orderType = row.original.assignmentType || row.original.orderType;
        const config = ORDER_TYPE_LABELS[orderType];
        return (
          <span className="inline-flex rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {config ? (de ? config.label : config.labelEn) : (orderType || '-')}
          </span>
        );
      },
    },
    {
      accessorKey: 'customerName',
      header: de ? 'Kunde / Projekt' : 'Customer / Project',
      size: 260,
      enableSorting: false,
      Cell: ({ row }) => {
        const name = row.original.appointment?.customerContactName || row.original.customerName || row.original.customer_name;
        const project = row.original.projectName || row.original.project_name;
        const projectNumber = row.original.projectNumber || row.original.project_number;
        const address = row.original.siteAddress || row.original.site_address || row.original.appointment?.customerNotes;
        return (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name || project || '-'}</p>
            {(project || projectNumber) && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {projectNumber ? <span className="font-mono">{projectNumber}</span> : null}
                {projectNumber && project ? <span className="mx-1">/</span> : null}
                {project}
              </p>
            )}
            {address ? (
              <p className="mt-0.5 flex max-w-[230px] items-center gap-1 truncate text-[11px] text-muted-foreground/80">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{address}</span>
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'employeeId',
      header: de ? 'Zuweisung' : 'Assignment',
      size: 180,
      enableSorting: false,
      Cell: ({ row }) => {
        const targetType = row.original.assignmentTargetType || row.original.assignment_target_type || 'EMPLOYEE';
        const isGroup = targetType !== 'EMPLOYEE';
        const unassigned = isOrderUnassigned(row.original);
        return (
          <span className={cn(
            'inline-flex max-w-[170px] items-center gap-1.5 truncate rounded-full border px-2 py-1 text-[11px] font-semibold',
            unassigned
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-border/70 bg-muted/35 text-foreground',
          )}>
            {isGroup && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">
              {assigneeLabel(row.original, de)}
            </span>
          </span>
        );
      },
    },
    {
      accessorKey: 'priority',
      header: de ? 'Prioritaet' : 'Priority',
      size: 120,
      enableSorting: false,
      Cell: ({ row }) => {
        const config = PRIORITY_CONFIG[row.original.priority || ORDER_PRIORITY.NORMAL];
        if (!config) return <span className="text-xs text-muted-foreground">-</span>;
        return (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', config.badge)}>
            {row.original.priority === ORDER_PRIORITY.URGENT && <AlertCircle className="h-3 w-3" />}
            {de ? config.label : config.labelEn}
          </span>
        );
      },
    },
    {
      accessorKey: 'startDatetime',
      header: de ? 'Termin' : 'Scheduled',
      size: 150,
      enableSorting: false,
      Cell: ({ row }) => {
        const startDate = getOrderStartDate(row.original);
        const endDate = getOrderEndDate(row.original);
        const overdue = isOrderOverdue(row.original, metricsNow);
        const dueToday = isOrderDueToday(row.original, metricsNow);
        if (!startDate) return <span className="text-xs text-muted-foreground/50">-</span>;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formatDate(startDate)}</span>
            </div>
            {endDate ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(endDate)}</p>
            ) : null}
            {(overdue || dueToday) && (
              <span className={cn(
                'mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase',
                overdue
                  ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}>
                {overdue ? (de ? 'Ueberfaellig' : 'Overdue') : (de ? 'Heute' : 'Today')}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      enableSorting: false,
      Cell: ({ row }) => <FieldOpsOrderStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'reportStatus',
      header: de ? 'Bericht' : 'Report',
      size: 150,
      enableSorting: false,
      Cell: ({ row }) => {
        const reportStatus = getOrderReportStatus(row.original);
        const documentCount = getOrderDocumentCount(row.original);
        const config = REPORT_STATUS_CONFIG[reportStatus];
        return (
          <div className="flex flex-col gap-1">
            {reportStatus ? (
              config ? (
                <span className={cn('w-fit rounded-full px-2 py-0.5 text-[11px] font-medium', config.badge)}>
                  {de ? config.label : config.labelEn}
                </span>
              ) : <span className="text-xs">{reportStatus}</span>
            ) : (
              <span className="text-xs text-muted-foreground/40">-</span>
            )}
            {documentCount > 0 && (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3" />
                {documentCount}
              </span>
            )}
          </div>
        );
      },
    },
  ], [de, metricsNow]);

  const handleCreate = (data) => {
    createOrder.mutate(data, { onSuccess: () => setShowCreate(false) });
  };

  const handleUpdate = (data) => {
    if (!editTarget) return;
    updateOrder.mutate({ id: editTarget.id || editTarget._id, data }, {
      onSuccess: () => setEditTarget(null),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteOrder.mutate(deleteTarget.id || deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const handleBulkDelete = () => {
    bulkDelete.mutate(selectedIds, {
      onSuccess: () => {
        setRowSelection({});
        setBulkDeleteOpen(false);
      },
    });
  };

  const handleExport = () => {
    exportOrders.mutate(exportFilters);
  };

  const handleNextPage = () => {
    if (!pagination.nextCursor) return;
    setCursorStack((stack) => [...stack, pagination.nextCursor]);
  };

  const handlePrevPage = () => {
    setCursorStack((stack) => stack.slice(0, -1));
  };

  return (
    <div className="space-y-6">
      <FieldOpsOrdersCommand
        title={t('fieldOps.orders.title', 'Orders')}
        description={t('fieldOps.orders.desc', 'Monitor and manage all technician orders.')}
        count={summaryTotal || orders.length}
        de={de}
        summary={summary}
        summaryTotal={summaryTotal}
        metrics={orderMetrics}
        isLoading={isFetching && orders.length === 0}
        syncTimestamp={syncTimestamp}
        activePreset={activePreset}
        onPreset={applyQuickPreset}
        onImport={() => setShowImport(true)}
        onExport={handleExport}
        onDownloadTemplate={() => downloadImportTemplate.mutate()}
        onCreate={() => setShowCreate(true)}
        isExporting={exportOrders.isPending}
        isTemplateDownloading={downloadImportTemplate.isPending}
      />

      <FieldOpsCreateOrderDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
        isLoading={createOrder.isPending}
      />

      <FieldOpsOrderImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        importOrders={importOrders}
        downloadImportTemplate={downloadImportTemplate}
      />

      <FieldOpsCreateOrderDialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onCreate={handleUpdate}
        isLoading={updateOrder.isPending}
        defaultValues={editTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={de ? 'Auftrag loeschen' : 'Delete Order'}
        description={de
          ? `Auftrag "${deleteTarget?.title || deleteTarget?.assignmentNumber}" wird unwiderruflich geloescht.`
          : `Order "${deleteTarget?.title || deleteTarget?.assignmentNumber}" will be permanently deleted.`}
        onConfirm={handleDelete}
        isLoading={deleteOrder.isPending}
        variant="destructive"
        confirmText={de ? 'Loeschen' : 'Delete'}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selectedIds.length} Auftraege loeschen` : `Delete ${selectedIds.length} Orders`}
        description={de
          ? `${selectedIds.length} Auftraege werden unwiderruflich geloescht.`
          : `${selectedIds.length} orders will be permanently deleted.`}
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
        variant="destructive"
        confirmText={de ? 'Alle loeschen' : 'Delete All'}
      />

      <section className="relative overflow-hidden rounded-xl border border-border/60 bg-card/95 p-4 shadow-theme-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(59_130_246_/_0.08),transparent_46%),radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.08),transparent_52%)]" />
        <div className="relative">
          <FieldOpsOrderFilters
            search={search}
            onSearch={updateSearch}
            status={status}
            onStatus={updateStatus}
            type={type}
            onType={updateType}
            priority={priority}
            onPriority={updatePriority}
            employeeId={employeeId}
            onEmployee={handleEmployeeFilter}
            teamId={teamId}
            onTeam={handleTeamFilter}
            projectId={projectId}
            onProject={updateProject}
            dateFrom={dateFrom}
            onDateFrom={updateDateFrom}
            dateTo={dateTo}
            onDateTo={updateDateTo}
            onClear={clear}
          />
        </div>
      </section>

      {isError && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-700 shadow-theme-sm dark:text-red-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{de ? 'Auftraege konnten nicht geladen werden' : 'Orders could not be loaded'}</p>
              <p className="text-xs opacity-80">{de ? 'Pruefen Sie die Verbindung und versuchen Sie es erneut.' : 'Check the connection and retry.'}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="w-fit gap-2 border-red-500/30 bg-background/80">
            <RefreshCw className="h-3.5 w-3.5" />
            {de ? 'Erneut laden' : 'Retry'}
          </Button>
        </div>
      )}

      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        onRowClick={(row) => router.push(`/field-ops/orders/${row.id || row._id}`)}
        emptyMessage={t('fieldOps.orders.empty', 'No orders found.')}
        emptyState={(
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10">
              <div className="absolute inset-[-6px] rounded-3xl bg-primary/15 blur-xl" />
              <AlertCircle className="h-6 w-6 text-primary/40" />
            </div>
            <p className="text-sm font-semibold text-foreground">{de ? 'Keine Auftraege gefunden' : 'No orders found'}</p>
            <p className="max-w-sm text-center text-xs">
              {de ? 'Aendern Sie die Filter oder erstellen Sie einen neuen Auftrag.' : 'Adjust filters or create a new order.'}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" onClick={clear} className="h-8 gap-2 rounded-lg">
                <RefreshCw className="h-3.5 w-3.5" />
                {de ? 'Filter zuruecksetzen' : 'Reset Filters'}
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)} className="h-8 rounded-lg">
                {de ? 'Neuer Auftrag' : 'New Order'}
              </Button>
            </div>
          </div>
        )}
        enableGlobalFilter={false}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id || row._id}
        cursorPagination={{
          hasPrev: cursorStack.length > 0,
          hasNext: Boolean(pagination.hasNext || pagination.nextCursor),
          isFetching,
          pageSize,
          onPrev: handlePrevPage,
          onNext: handleNextPage,
          onPageSizeChange: (nextSize) => {
            setPageSize(nextSize);
            setCursorStack([]);
          },
        }}
        renderRowActions={({ row }) => (
          <RowActionsMenu items={[
            {
              label: de ? 'Oeffnen' : 'View',
              icon: Eye,
              onSelect: () => router.push(`/field-ops/orders/${row.original.id || row.original._id}`),
            },
            {
              label: de ? 'Bearbeiten' : 'Edit',
              icon: Pencil,
              onSelect: () => setEditTarget(row.original),
            },
            { type: 'separator' },
            {
              label: de ? 'Loeschen' : 'Delete',
              icon: Trash2,
              destructive: true,
              onSelect: () => setDeleteTarget(row.original),
            },
          ]} />
        )}
      />

      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {de ? `${selectedIds.length} loeschen` : `Delete ${selectedIds.length}`}
        </Button>
      </BulkActionsBar>
    </div>
  );
}
