'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShoppingCart } from 'lucide-react';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { purchaseOrderService } from '@/modules/crm/services/purchase-order-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/shared/components/empty-state';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function ReorderTab({ onCreateOrder }) {
  const { t } = useLanguage();
  const tx = useCallback((key) => t(`crm.procurement.${key}`), [t]);
  const [globalFilter, setGlobalFilter] = useState('');
  const debouncedSearch = useDebounce(globalFilter, 300);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    sortBy: 'name',
    sortOrder: 'asc',
  }), [debouncedSearch]);

  const {
    items,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.spareParts.lowStock(merged),
    queryFn: (merged) => purchaseOrderService.getLowStock(merged),
    params: filters,
    initialSize: 25,
  });

  useEffect(() => {
    resetCursor();
  }, [debouncedSearch, resetCursor]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: tx('columns.article'),
      cell: ({ row }) => {
        const part = row.original;
        return (
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{part.name}</p>
            <p className="text-xs text-muted-foreground">{[part.partNumber, part.manufacturer].filter(Boolean).join(' - ')}</p>
          </div>
        );
      },
      size: 220,
    },
    {
      id: 'stockGap',
      header: tx('columns.stockGap'),
      cell: ({ row }) => {
        const part = row.original;
        const current = part.currentStock ?? 0;
        const min = part.minStockLevel ?? 0;
        const gap = min - current;
        const isCritical = current === 0;
        return (
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-bold', isCritical ? 'text-red-500' : 'text-amber-500')}>
              {current}
            </span>
            <span className="text-muted-foreground text-xs">-&gt; {tx('stock.minPrefix')} {min}</span>
            <span className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
              isCritical
                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
            )}>
              {isCritical ? tx('stock.outOfStock') : `-${gap} ${part.unit || 'Stk'}`}
            </span>
          </div>
        );
      },
      size: 200,
    },
    {
      id: 'supplier',
      header: tx('columns.supplier'),
      cell: ({ row }) => {
        const part = row.original;
        return <span className="text-sm">{part.preferredSupplier?.name || part.supplierId?.name || part.supplierName || '-'}</span>;
      },
      size: 160,
    },
    {
      id: 'unitPrice',
      header: tx('columns.purchasePrice'),
      cell: ({ row }) => {
        const part = row.original;
        if (!part.unitPrice) return <span className="text-muted-foreground text-sm">-</span>;
        return (
          <span className="text-sm">
            {Number(part.unitPrice).toLocaleString('de-CH', { style: 'currency', currency: part.currency || 'CHF' })}
          </span>
        );
      },
      size: 120,
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          onClick={() => onCreateOrder?.(row.original)}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {tx('actions.order')}
        </Button>
      ),
      size: 110,
    },
  ], [tx, onCreateOrder]);

  return (
    <DataTableShell
      columns={columns}
      data={items}
      isLoading={isFetching && items.length === 0}
      rowCount={items.length}
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
          icon={AlertTriangle}
          title={tx('empty.noReorders.title')}
          description={tx('empty.noReorders.description')}
        />
      }
    />
  );
}
