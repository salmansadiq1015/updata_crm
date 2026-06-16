'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, MoreHorizontal, Plus, TrendingDown, TrendingUp, Sliders } from 'lucide-react';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { sparePartService } from '@/modules/crm/services/spare-part-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdjustStockDialog } from './adjust-stock-dialog';
import { PartHistoryDialog } from './part-history-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const CATEGORY_META = {
  filter: { labelKey: 'category.filter', color: 'text-sky-600', bg: 'bg-sky-100 dark:bg-sky-950/40' },
  gasket: { labelKey: 'category.gasket', color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-950/40' },
  pump_part: { labelKey: 'category.pump_part', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950/40' },
  valve: { labelKey: 'category.valve', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/40' },
  sensor: { labelKey: 'category.sensor', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/40' },
  igniter: { labelKey: 'category.igniter', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-950/40' },
  burner_part: { labelKey: 'category.burner_part', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950/40' },
  control_board: { labelKey: 'category.control_board', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-950/40' },
  other: { labelKey: 'category.other', color: 'text-gray-600', bg: 'bg-muted' },
};

function StockBadge({ current, minimum, unit }) {
  const isLow = current <= minimum;
  const isCritical = current === 0;
  return (
    <div className="flex items-center gap-1.5">
      {isCritical ? (
        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
      ) : isLow ? (
        <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
      ) : (
        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
      )}
      <span className={cn(
        'text-sm font-semibold',
        isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-foreground',
      )}>
        {current}
      </span>
      <span className="text-xs text-muted-foreground">/ {minimum} {unit || 'Stk'}</span>
    </div>
  );
}

export function InventoryTab({ onCreateOrder }) {
  const { t } = useLanguage();
  const tx = useCallback((key) => t(`crm.procurement.${key}`), [t]);

  const [globalFilter, setGlobalFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const debouncedSearch = useDebounce(globalFilter, 300);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    stockStatus: stockFilter !== 'all' ? stockFilter : undefined,
    sortBy: 'name',
    sortOrder: 'asc',
  }), [debouncedSearch, categoryFilter, stockFilter]);

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
    queryKey: (merged) => queryKeys.crm.spareParts.list(merged),
    queryFn: (merged) => sparePartService.list(merged),
    params: filters,
    initialSize: 25,
  });

  useEffect(() => {
    resetCursor();
  }, [debouncedSearch, categoryFilter, stockFilter, resetCursor]);

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
      accessorKey: 'currentStock',
      header: tx('columns.stockMin'),
      cell: ({ row }) => {
        const p = row.original;
        return (
          <StockBadge
            current={p.currentStock ?? 0}
            minimum={p.minStockLevel ?? 0}
            unit={p.unit}
          />
        );
      },
      size: 140,
    },
    {
      accessorKey: 'category',
      header: tx('columns.category'),
      cell: ({ row }) => {
        const cat = CATEGORY_META[row.original.category] || CATEGORY_META.other;
        return (
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', cat.bg, cat.color)}>
            {tx(cat.labelKey)}
          </span>
        );
      },
      size: 110,
    },
    {
      id: 'supplier',
      header: tx('columns.supplier'),
      cell: ({ row }) => {
        const p = row.original;
        const name = p.preferredSupplier?.name || p.supplierId?.name || p.supplierName || '-';
        return (
          <div className="min-w-0">
            <p className="text-sm truncate">{name}</p>
            {p.supplierPartNumber && (
              <p className="text-xs text-muted-foreground">{p.supplierPartNumber}</p>
            )}
          </div>
        );
      },
      size: 160,
    },
    {
      id: 'price',
      header: tx('columns.price'),
      cell: ({ row }) => {
        const p = row.original;
        if (!p.unitPrice) return <span className="text-muted-foreground text-sm">-</span>;
        return (
          <span className="text-sm font-medium">
            {Number(p.unitPrice).toLocaleString('de-CH', { style: 'currency', currency: p.currency || 'CHF' })}
          </span>
        );
      },
      size: 100,
    },
  ], [tx]);

  const renderRowActions = ({ row }) => {
    const part = row.original;
    const isLow = (part.currentStock ?? 0) <= (part.minStockLevel ?? 0);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/row:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setAdjustTarget(part)}>
            <Sliders className="h-3.5 w-3.5 mr-2" />
            {tx('actions.adjustStock')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHistoryTarget(part)}>
            <History className="h-3.5 w-3.5 mr-2" />
            {tx('actions.showHistory')}
          </DropdownMenuItem>
          {isLow && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCreateOrder?.(part)} className="text-amber-600 dark:text-amber-400">
                <Plus className="h-3.5 w-3.5 mr-2" />
                {tx('actions.createOrder')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={tx('filters.allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx('filters.allCategories')}</SelectItem>
            {Object.entries(CATEGORY_META).map(([key, value]) => (
              <SelectItem key={key} value={key}>{tx(value.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={tx('filters.allStock')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx('filters.allStockLevels')}</SelectItem>
            <SelectItem value="low">{tx('filters.low')}</SelectItem>
            <SelectItem value="ok">{tx('filters.ok')}</SelectItem>
            <SelectItem value="out">{tx('filters.out')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTableShell
        columns={columns}
        data={items}
        isLoading={isFetching && items.length === 0}
        rowCount={items.length}
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
      />

      <AdjustStockDialog
        open={!!adjustTarget}
        onOpenChange={(value) => !value && setAdjustTarget(null)}
        part={adjustTarget}
      />
      <PartHistoryDialog
        open={!!historyTarget}
        onOpenChange={(value) => !value && setHistoryTarget(null)}
        part={historyTarget}
      />
    </div>
  );
}
