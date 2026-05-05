'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsOrderMutations } from '@/modules/field-ops/hooks/use-field-ops-order-mutations';
import { FieldOpsOrderFilters } from './field-ops-order-filters';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsCreateOrderDialog } from './field-ops-create-order-dialog';
import { ORDER_TYPE_LABELS, REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
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
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';

export function FieldOpsOrdersTable() {
  const { t, locale: language } = useLanguage();
  const de = language === 'de';
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});

  const debouncedSearch = useDebounce(search, 300);
  const { createOrder, updateOrder, deleteOrder, bulkDelete } = useFieldOpsOrderMutations();

  const filters = useMemo(() => {
    const f = {};
    if (debouncedSearch) f.search = debouncedSearch;
    if (status !== 'all') f.status = status;
    if (type !== 'all') f.orderType = type;
    return f;
  }, [debouncedSearch, status, type]);

  const { data: orders = [], isFetching } = useFieldOpsOrders(filters);

  const clear = useCallback(() => { setSearch(''); setStatus('all'); setType('all'); }, []);

  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k),
    [rowSelection],
  );

  const columns = useMemo(() => [
    {
      accessorKey: 'assignmentNumber',
      header: de ? 'Auftrag #' : 'Order #',
      size: 130,
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
      Cell: ({ row }) => {
        const type = row.original.assignmentType || row.original.orderType;
        const cfg = ORDER_TYPE_LABELS[type];
        return <span className="text-xs text-muted-foreground">{cfg ? (de ? cfg.label : cfg.labelEn) : (type || '—')}</span>;
      },
    },
    {
      accessorKey: 'customerName',
      header: de ? 'Kunde' : 'Customer',
      size: 200,
      Cell: ({ row }) => {
        const name = row.original.appointment?.customerContactName || row.original.customerName;
        const addr = row.original.siteAddress || row.original.appointment?.customerNotes;
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name || '—'}</p>
            {addr && <p className="text-xs text-muted-foreground truncate">{addr}</p>}
          </div>
        );
      },
    },
    {
      accessorKey: 'employeeId',
      header: de ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => {
        const emp = row.original.employeeId;
        if (!emp || typeof emp !== 'object') return <span className="text-xs text-muted-foreground/50">—</span>;
        return <span className="text-xs">{emp.firstName} {emp.lastName}</span>;
      },
    },
    {
      accessorKey: 'startDatetime',
      header: de ? 'Termin' : 'Scheduled',
      size: 120,
      Cell: ({ row }) => {
        const d = row.original.startDatetime || row.original.scheduledStart;
        return d
          ? <span className="text-xs">{formatDate(d)}</span>
          : <span className="text-xs text-muted-foreground/50">—</span>;
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ row }) => <FieldOpsOrderStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'reportStatus',
      header: de ? 'Bericht' : 'Report',
      size: 120,
      Cell: ({ row }) => {
        const rs = row.original.reportStatus;
        if (!rs) return <span className="text-xs text-muted-foreground/40">—</span>;
        const cfg = REPORT_STATUS_CONFIG[rs];
        return cfg ? (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', cfg.badge)}>
            {de ? cfg.label : cfg.labelEn}
          </span>
        ) : <span className="text-xs">{rs}</span>;
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
      onSuccess: () => { setRowSelection({}); setBulkDeleteOpen(false); },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.orders.title', 'Orders')}
        description={t('fieldOps.orders.desc', 'Monitor and manage all technician orders.')}
        count={orders.length}
      >
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {de ? 'Neuer Auftrag' : 'New Order'}
        </Button>
      </PageHeader>

      {/* Create dialog */}
      <FieldOpsCreateOrderDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
        isLoading={createOrder.isPending}
      />

      {/* Edit dialog */}
      <FieldOpsCreateOrderDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null); }}
        onCreate={handleUpdate}
        isLoading={updateOrder.isPending}
        defaultValues={editTarget}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={de ? 'Auftrag löschen' : 'Delete Order'}
        description={de
          ? `Auftrag "${deleteTarget?.title || deleteTarget?.assignmentNumber}" wird unwiderruflich gelöscht.`
          : `Order "${deleteTarget?.title || deleteTarget?.assignmentNumber}" will be permanently deleted.`}
        onConfirm={handleDelete}
        isLoading={deleteOrder.isPending}
        variant="destructive"
        confirmText={de ? 'Löschen' : 'Delete'}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selectedIds.length} Aufträge löschen` : `Delete ${selectedIds.length} Orders`}
        description={de
          ? `${selectedIds.length} Aufträge werden unwiderruflich gelöscht.`
          : `${selectedIds.length} orders will be permanently deleted.`}
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
        variant="destructive"
        confirmText={de ? 'Alle löschen' : 'Delete All'}
      />

      <FieldOpsOrderFilters
        search={search} onSearch={(v) => setSearch(v)}
        status={status} onStatus={setStatus}
        type={type} onType={setType}
        onClear={clear}
      />

      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        onRowClick={(row) => router.push(`/field-ops/orders/${row.id || row._id}`)}
        emptyMessage={t('fieldOps.orders.empty', 'No orders found.')}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row.id || row._id}
        renderRowActions={({ row }) => (
          <RowActionsMenu items={[
            {
              label: de ? 'Öffnen' : 'View',
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
              label: de ? 'Löschen' : 'Delete',
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
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          {de ? `${selectedIds.length} löschen` : `Delete ${selectedIds.length}`}
        </Button>
      </BulkActionsBar>
    </div>
  );
}
