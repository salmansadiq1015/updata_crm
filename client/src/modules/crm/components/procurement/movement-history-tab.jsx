'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, History } from 'lucide-react';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { purchaseOrderService } from '@/modules/crm/services/purchase-order-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/shared/components/empty-state';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const MOVEMENT_META = {
  in: { icon: ArrowDownCircle, labelKey: 'movement.in', cls: 'text-emerald-500' },
  out: { icon: ArrowUpCircle, labelKey: 'movement.out', cls: 'text-red-500' },
  correction: { icon: RefreshCw, labelKey: 'movement.correction', cls: 'text-sky-500' },
  receipt: { icon: ArrowDownCircle, labelKey: 'movement.receipt', cls: 'text-brand-500' },
  adjustment: { icon: RefreshCw, labelKey: 'movement.adjustment', cls: 'text-amber-500' },
};

const MOVEMENT_FILTERS = [
  { value: 'all', labelKey: 'filters.allMovements' },
  { value: 'in', labelKey: 'filters.incoming' },
  { value: 'out', labelKey: 'filters.outgoing' },
  { value: 'receipt', labelKey: 'filters.goodsReceipts' },
  { value: 'correction', labelKey: 'filters.corrections' },
];

export function MovementHistoryTab() {
  const { t } = useLanguage();
  const tx = useCallback((key) => t(`crm.procurement.${key}`), [t]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const debouncedSearch = useDebounce(globalFilter, 300);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }), [debouncedSearch, typeFilter]);

  const {
    items: movements,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.spareParts.movements(merged),
    queryFn: (merged) => purchaseOrderService.getMovements(merged),
    params: filters,
    initialSize: 50,
  });

  useEffect(() => {
    resetCursor();
  }, [debouncedSearch, typeFilter, resetCursor]);

  const columns = useMemo(() => [
    {
      accessorKey: 'createdAt',
      header: tx('columns.date'),
      cell: ({ row }) => {
        const date = row.original.createdAt;
        return date
          ? <span className="text-sm">{format(new Date(date), 'dd.MM.yyyy HH:mm')}</span>
          : <span className="text-muted-foreground text-sm">-</span>;
      },
      size: 140,
    },
    {
      accessorKey: 'type',
      header: tx('columns.type'),
      cell: ({ row }) => {
        const meta = MOVEMENT_META[row.original.type] || MOVEMENT_META.adjustment;
        const Icon = meta.icon;
        return (
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', meta.cls)}>
            <Icon className="h-4 w-4 shrink-0" />
            {tx(meta.labelKey)}
          </div>
        );
      },
      size: 130,
    },
    {
      id: 'part',
      header: tx('columns.article'),
      cell: ({ row }) => {
        const movement = row.original;
        const name = movement.sparePartId?.name || movement.partName || '-';
        const number = movement.sparePartId?.partNumber || '';
        return (
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{name}</p>
            {number && <p className="text-xs text-muted-foreground">{number}</p>}
          </div>
        );
      },
      size: 200,
    },
    {
      accessorKey: 'quantity',
      header: tx('columns.qty'),
      cell: ({ row }) => {
        const movement = row.original;
        const isIn = ['in', 'receipt'].includes(movement.type);
        return (
          <span className={cn('text-sm font-semibold', isIn ? 'text-emerald-500' : 'text-red-500')}>
            {isIn ? '+' : '-'}{Math.abs(movement.quantity)}
          </span>
        );
      },
      size: 80,
    },
    {
      id: 'stockAfter',
      header: tx('columns.stockAfter'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.stockAfter ?? '-'}</span>
      ),
      size: 120,
    },
    {
      id: 'reference',
      header: tx('columns.reference'),
      cell: ({ row }) => {
        const movement = row.original;
        return (
          <span className="text-xs text-muted-foreground">
            {movement.purchaseOrderId?.orderNumber || movement.reason || '-'}
          </span>
        );
      },
      size: 140,
    },
    {
      id: 'user',
      header: tx('columns.user'),
      cell: ({ row }) => {
        const user = row.original.createdBy;
        return (
          <span className="text-sm text-muted-foreground">
            {user?.name || user?.email || '-'}
          </span>
        );
      },
      size: 140,
    },
  ], [tx]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOVEMENT_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>{tx(filter.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTableShell
        columns={columns}
        data={movements}
        isLoading={isFetching && movements.length === 0}
        rowCount={movements.length}
        enableGlobalFilter
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
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
            icon={History}
            title={tx('empty.noMovements.title')}
            description={tx('empty.noMovements.description')}
          />
        }
      />
    </div>
  );
}
