'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plus, PackageCheck, X, Eye } from 'lucide-react';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { purchaseOrderService } from '@/modules/crm/services/purchase-order-service';
import { usePurchaseOrderMutations } from '@/modules/crm/hooks/use-procurement-mutations';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/shared/components/empty-state';
import { PurchaseOrderDialog } from './purchase-order-dialog';
import { GoodsReceiptDialog } from './goods-receipt-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const STATUS_META = {
  draft: { labelKey: 'status.draft', cls: 'bg-muted text-muted-foreground' },
  sent: { labelKey: 'status.sent', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  partial: { labelKey: 'status.partial', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  received: { labelKey: 'status.received', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  cancelled: { labelKey: 'status.cancelled', cls: 'bg-muted text-muted-foreground line-through' },
};

const STATUS_FILTERS = [
  { value: 'open', labelKey: 'filters.open' },
  { value: 'sent', labelKey: 'filters.sent' },
  { value: 'partial', labelKey: 'filters.partial' },
  { value: 'received', labelKey: 'filters.received' },
  { value: 'cancelled', labelKey: 'filters.cancelled' },
  { value: 'all', labelKey: 'filters.all' },
];

export function PurchaseOrdersTab({ prefillPart, onPrefillClear }) {
  const { t } = useLanguage();
  const tx = useCallback((key) => t(`crm.procurement.${key}`), [t]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const debouncedSearch = useDebounce(globalFilter, 300);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }), [debouncedSearch, statusFilter]);

  const {
    items: orders,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.purchaseOrders.list(merged),
    queryFn: (merged) => purchaseOrderService.list(merged),
    params: filters,
    initialSize: 25,
  });

  useEffect(() => {
    resetCursor();
  }, [debouncedSearch, statusFilter, resetCursor]);

  const { cancel } = usePurchaseOrderMutations();
  const orderDialogOpen = createOpen || !!prefillPart;

  const handleOrderDialogOpenChange = (open) => {
    if (open) {
      setCreateOpen(true);
      return;
    }
    setCreateOpen(false);
    onPrefillClear?.();
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'orderNumber',
      header: tx('columns.orderNo'),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.orderNumber || row.original._id?.slice(-8)}</span>
      ),
      size: 110,
    },
    {
      id: 'supplier',
      header: tx('columns.supplier'),
      cell: ({ row }) => {
        const supplier = row.original.supplierId || row.original.supplier || {};
        return (
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{supplier.name || '-'}</p>
            {supplier.email && <p className="text-xs text-muted-foreground truncate">{supplier.email}</p>}
          </div>
        );
      },
      size: 180,
    },
    {
      id: 'items',
      header: tx('columns.items'),
      cell: ({ row }) => {
        const items = row.original.items || [];
        return (
          <div className="text-sm">
            <span className="font-medium">{items.length}</span>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1.5 truncate max-w-[140px] inline-block align-bottom">
                {items.slice(0, 2).map((item) => item.name || item.partNumber).join(', ')}
                {items.length > 2 && ` +${items.length - 2}`}
              </span>
            )}
          </div>
        );
      },
      size: 200,
    },
    {
      accessorKey: 'totalAmount',
      header: tx('columns.amount'),
      cell: ({ row }) => {
        const order = row.original;
        if (!order.totalAmount) return <span className="text-muted-foreground text-sm">-</span>;
        return (
          <span className="text-sm font-medium">
            {Number(order.totalAmount).toLocaleString('de-CH', { style: 'currency', currency: order.currency || 'CHF' })}
          </span>
        );
      },
      size: 110,
    },
    {
      accessorKey: 'expectedDelivery',
      header: tx('columns.expected'),
      cell: ({ row }) => {
        const date = row.original.expectedDelivery;
        return date
          ? <span className="text-sm">{format(new Date(date), 'dd.MM.yyyy')}</span>
          : <span className="text-muted-foreground text-sm">-</span>;
      },
      size: 110,
    },
    {
      accessorKey: 'status',
      header: tx('columns.status'),
      cell: ({ row }) => {
        const status = STATUS_META[row.original.status] || STATUS_META.draft;
        return (
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', status.cls)}>
            {tx(status.labelKey)}
          </span>
        );
      },
      size: 100,
    },
  ], [tx]);

  const renderRowActions = ({ row }) => {
    const order = row.original;
    const terminal = ['received', 'cancelled'].includes(order.status);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/row:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!terminal && (
            <DropdownMenuItem onClick={() => setReceiveTarget(order)}>
              <PackageCheck className="h-3.5 w-3.5 mr-2" />
              {tx('actions.receiveGoods')}
            </DropdownMenuItem>
          )}
          {!terminal && <DropdownMenuSeparator />}
          {!terminal && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => cancel.mutate(order._id || order.id)}
            >
              <X className="h-3.5 w-3.5 mr-2" />
              {tx('actions.cancel')}
            </DropdownMenuItem>
          )}
          {terminal && (
            <DropdownMenuItem disabled>
              <Eye className="h-3.5 w-3.5 mr-2" />
              {tx('actions.closed')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status.value} value={status.value}>{tx(status.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {tx('actions.createOrder')}
        </Button>
      </div>

      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        rowCount={orders.length}
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        renderRowActions={renderRowActions}
        cursorPagination={{
          pageSize,
          onPageSizeChange: setPageSize,
          hasNext,
          hasPrev,
          isFetching,
          onNext,
          onPrev,
        }}
        emptyState={
          <EmptyState
            icon={Plus}
            title={tx('empty.noOrders.title')}
            description={tx('empty.noOrders.description')}
          />
        }
      />

      <PurchaseOrderDialog
        key={prefillPart?._id || prefillPart?.id || 'manual-order'}
        open={orderDialogOpen}
        onOpenChange={handleOrderDialogOpenChange}
        prefillPart={prefillPart}
      />

      <GoodsReceiptDialog
        open={!!receiveTarget}
        onOpenChange={(value) => !value && setReceiveTarget(null)}
        order={receiveTarget}
      />
    </div>
  );
}
