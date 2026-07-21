'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, ArrowUpDown, Search, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

// Stable empty default so `state.sorting` keeps the same reference across renders
// when no sorting is controlled — a fresh [] each render churns the table's models.
const EMPTY_SORTING = [];

export function DataTableShell({
  columns: rawColumns,
  data = [],
  isLoading = false,
  rowCount = 0,
  pagination,
  onPaginationChange,
  onSortingChange,
  sorting,
  enableGlobalFilter = true,
  onGlobalFilterChange,
  globalFilter = '',
  renderTopToolbarCustomActions,
  renderRowActions,
  manualPagination = true,
  manualSorting = true,
  manualFiltering = true,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
  emptyState,
  /**
   * Optional cursor pagination mode. When provided, replaces the numeric
   * pagination footer with Prev / Next buttons.
   * Shape: {
   *   hasPrev: boolean,
   *   hasNext: boolean,
   *   isFetching: boolean,
   *   onPrev: () => void,
   *   onNext: () => void,
   *   pageSize: number,
   *   onPageSizeChange?: (size: number) => void,
   * }
   */
  cursorPagination,
}) {
  const { t } = useLanguage();
  const columns = useMemo(() => {
    const cols = rawColumns.map((col) => ({
      ...col,
      cell: col.cell || col.Cell
        ? (info) => {
            const renderer = col.cell || col.Cell;
            return renderer({ row: info.row, cell: info.cell, getValue: info.getValue });
          }
        : undefined,
    }));

    if (enableRowSelection) {
      cols.unshift({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        size: 40,
        enableSorting: false,
      });
    }

    if (renderRowActions) {
      cols.push({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          // Stop propagation so action clicks never trigger the row's onRowClick.
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            {renderRowActions({ row })}
          </div>
        ),
        size: 56,
        enableSorting: false,
      });
    }

    return cols;
  }, [rawColumns, enableRowSelection, renderRowActions]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting || EMPTY_SORTING,
      globalFilter: globalFilter || '',
      ...(pagination ? { pagination } : {}),
      ...(enableRowSelection && rowSelection != null ? { rowSelection } : {}),
    },
    onSortingChange: onSortingChange || undefined,
    onGlobalFilterChange: onGlobalFilterChange || undefined,
    onPaginationChange: onPaginationChange || undefined,
    onRowSelectionChange: onRowSelectionChange || undefined,
    getRowId: getRowId || ((row) => row._id || row.id),
    // When pagination is externally controlled, TanStack's autoReset fires
    // onPaginationChange whenever `data` changes; with a controlled state setter
    // that mints a new pagination object each time, this feeds back into an
    // infinite render loop (froze the whole page). Callers that control
    // pagination already reset the page index themselves on filter changes.
    ...(pagination ? { autoResetPageIndex: false } : {}),
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? { manualSorting: true } : { getSortedRowModel: getSortedRowModel() }),
    ...(manualPagination ? { manualPagination: true, rowCount } : { getPaginationRowModel: getPaginationRowModel() }),
    ...(manualFiltering ? { manualFiltering: true } : { getFilteredRowModel: getFilteredRowModel() }),
    enableRowSelection,
  });

  const pageCount = manualPagination
    ? Math.ceil(rowCount / (pagination?.pageSize || 25))
    : table.getPageCount();

  const currentPage = (pagination?.pageIndex ?? 0) + 1;

  const showToolbar = !!renderTopToolbarCustomActions || enableGlobalFilter;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-theme-sm">
      {/* Toolbar — only when there's something to show (avoids an empty strip) */}
      {showToolbar && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            {renderTopToolbarCustomActions && renderTopToolbarCustomActions({ table })}
          </div>
          {enableGlobalFilter && (
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t('common.search', 'Suchen...')}
                value={globalFilter}
                onChange={(e) => onGlobalFilterChange?.(e.target.value)}
                className="h-8 pl-9 rounded-lg bg-muted/40 border-border/50 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border/40 bg-muted/20 hover:bg-muted/20">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors'
                    )}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-muted-foreground/50">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-primary" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown className="h-3 w-3 text-primary" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="border-b border-border/20">
                  {columns.map((_, j) => (
                    <TableCell key={j} className="px-4 py-2.5">
                      <div className="h-4 w-full rounded skeleton-shimmer" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40 p-0">
                  {emptyState ?? (
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full">
                      <div className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                        <Inbox className="h-6 w-6 text-primary/40" />
                      </div>
                      <p className="text-sm font-medium">{t('common.noResults', 'Keine Eintraege vorhanden')}</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'group/row border-b border-border/20 transition-colors h-10',
                    row.getIsSelected() && 'bg-primary/5',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-muted/40'
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {cursorPagination ? (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('common.rows', 'Zeilen')}</span>
            <Select
              value={String(cursorPagination.pageSize || 25)}
              onValueChange={(val) => cursorPagination.onPageSizeChange?.(Number(val))}
            >
              <SelectTrigger className="h-7 w-16 rounded-md text-xs data-[size=default]:h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="top" align="start" sideOffset={6}>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cursorPagination.isFetching && (
              <span className="ml-2 text-xs text-muted-foreground/60 italic">{t('common.loading', 'Wird geladen...')}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-md text-xs"
              onClick={cursorPagination.onPrev}
              disabled={!cursorPagination.hasPrev || cursorPagination.isFetching}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('common.back', 'Zurueck')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-md text-xs"
              onClick={cursorPagination.onNext}
              disabled={!cursorPagination.hasNext || cursorPagination.isFetching}
            >
              {t('common.next', 'Weiter')}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/10">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('common.rows', 'Zeilen')}</span>
            <Select
              value={String(pagination?.pageSize || 25)}
              onValueChange={(val) => {
                onPaginationChange?.({ pageIndex: 0, pageSize: Number(val) });
              }}
            >
              <SelectTrigger className="h-7 w-16 rounded-md text-xs data-[size=default]:h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="top" align="start" sideOffset={6}>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">
              {currentPage} / {pageCount || 1}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: 0 })} disabled={currentPage <= 1}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pagination?.pageIndex || 0) - 1 })} disabled={currentPage <= 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pagination?.pageIndex || 0) + 1 })} disabled={currentPage >= pageCount}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pageCount || 1) - 1 })} disabled={currentPage >= pageCount}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
