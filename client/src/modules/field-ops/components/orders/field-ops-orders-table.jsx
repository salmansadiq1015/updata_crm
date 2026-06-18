'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsOrderMutations } from '@/modules/field-ops/hooks/use-field-ops-order-mutations';
import { FieldOpsOrderFilters } from './field-ops-order-filters';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsCreateOrderDialog } from './field-ops-create-order-dialog';
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
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { AlertCircle, Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 25;
const STATUS_SUMMARY_ORDER = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'];
const EMPTY_SUMMARY = Object.freeze({});

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

function SummaryCards({ summary, de }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {STATUS_SUMMARY_ORDER.map((status) => {
        const config = ORDER_STATUS_CONFIG[status];
        const count = summary?.[status] || 0;
        return (
          <div key={status} className="rounded-lg border border-border/60 bg-card px-3 py-2.5 shadow-theme-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {de ? config.label : config.labelEn}
              </span>
              <span className={cn('h-2 w-2 rounded-full', config.dot)} />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
          </div>
        );
      })}
    </div>
  );
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
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});

  const debouncedSearch = useDebounce(search, 300);
  const { createOrder, updateOrder, deleteOrder, bulkDelete } = useFieldOpsOrderMutations();
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

  const resetPaging = useCallback(() => {
    setCursorStack([]);
    setRowSelection({});
  }, []);

  const { data: ordersPage, isFetching } = useFieldOpsOrders(filters);
  const orders = ordersPage?.items ?? [];
  const pagination = ordersPage?.pagination ?? {};
  const summary = ordersPage?.summary ?? EMPTY_SUMMARY;
  const summaryTotal = useMemo(
    () => Object.values(summary).reduce((total, value) => total + Number(value || 0), 0),
    [summary],
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
      size: 130,
      enableSorting: false,
      Cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.assignmentNumber || row.original._id?.slice(-6)}
        </span>
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
        return <span className="text-xs text-muted-foreground">{config ? (de ? config.label : config.labelEn) : (orderType || '-')}</span>;
      },
    },
    {
      accessorKey: 'customerName',
      header: de ? 'Kunde / Projekt' : 'Customer / Project',
      size: 220,
      enableSorting: false,
      Cell: ({ row }) => {
        const name = row.original.appointment?.customerContactName || row.original.customerName || row.original.customer_name;
        const project = row.original.projectName || row.original.project_name;
        const address = row.original.siteAddress || row.original.site_address || row.original.appointment?.customerNotes;
        return (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name || project || '-'}</p>
            {(project || address) && <p className="truncate text-xs text-muted-foreground">{project || address}</p>}
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
        return (
          <span className="inline-flex max-w-[160px] items-center gap-1.5 truncate text-xs">
            {isGroup && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className={cn(!isGroup && !row.original.employeeId && 'text-muted-foreground/60')}>
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
      size: 120,
      enableSorting: false,
      Cell: ({ row }) => {
        const date = row.original.startDatetime || row.original.scheduledStart || row.original.scheduled_start;
        return date
          ? <span className="text-xs">{formatDate(date)}</span>
          : <span className="text-xs text-muted-foreground/50">-</span>;
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
      size: 120,
      enableSorting: false,
      Cell: ({ row }) => {
        const reportStatus = row.original.reportStatus || row.original.report_status;
        if (!reportStatus) return <span className="text-xs text-muted-foreground/40">-</span>;
        const config = REPORT_STATUS_CONFIG[reportStatus];
        return config ? (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', config.badge)}>
            {de ? config.label : config.labelEn}
          </span>
        ) : <span className="text-xs">{reportStatus}</span>;
      },
    },
  ], [de]);

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

  const handleNextPage = () => {
    if (!pagination.nextCursor) return;
    setCursorStack((stack) => [...stack, pagination.nextCursor]);
  };

  const handlePrevPage = () => {
    setCursorStack((stack) => stack.slice(0, -1));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.orders.title', 'Orders')}
        description={t('fieldOps.orders.desc', 'Monitor and manage all technician orders.')}
        count={summaryTotal || orders.length}
      >
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {de ? 'Neuer Auftrag' : 'New Order'}
        </Button>
      </PageHeader>

      <SummaryCards summary={summary} de={de} />

      <FieldOpsCreateOrderDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
        isLoading={createOrder.isPending}
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

      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        onRowClick={(row) => router.push(`/field-ops/orders/${row.id || row._id}`)}
        emptyMessage={t('fieldOps.orders.empty', 'No orders found.')}
        emptyState={(
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5">
              <AlertCircle className="h-6 w-6 text-primary/40" />
            </div>
            <p className="text-sm font-medium">{de ? 'Keine Auftraege gefunden' : 'No orders found'}</p>
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
