'use client';

import { useMemo, useCallback } from 'react';
import type {
  ColumnDef,
  SortingState,
  PaginationState,
  RowSelectionState,
  VisibilityState,
  OnChangeFn,
  Row,
} from '@tanstack/react-table';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

import { DataTableToolbar } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';

interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];

  // Server-side control
  rowCount?: number;
  isLoading?: boolean;

  // Pagination
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualPagination?: boolean;

  // Sorting
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;

  // Filtering
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  enableGlobalFilter?: boolean;
  manualFiltering?: boolean;

  // Selection
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  // Column visibility
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  enableColumnVisibility?: boolean;

  // Row behavior
  onRowClick?: (row: Row<TData>) => void;
  getRowId?: (row: TData) => string;
  activeRowId?: string | null;

  // Slots
  toolbarActions?: (table: ReturnType<typeof useReactTable<TData>>) => React.ReactNode;
  renderRowActions?: (props: { row: Row<TData> }) => React.ReactNode;
  bulkActions?: (selectedIds: string[]) => React.ReactNode;
  toolbarChildren?: React.ReactNode;

  // Skeleton
  skeletonRows?: number;

  // Empty state
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
}

export function DataTable<TData, TValue = unknown>({
  columns: rawColumns,
  data = [],
  rowCount = 0,
  isLoading = false,
  pagination,
  onPaginationChange,
  manualPagination = true,
  sorting,
  onSortingChange,
  manualSorting = true,
  globalFilter = '',
  onGlobalFilterChange,
  enableGlobalFilter = true,
  manualFiltering = true,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  enableColumnVisibility = true,
  onRowClick,
  getRowId,
  activeRowId,
  toolbarActions,
  renderRowActions,
  bulkActions,
  toolbarChildren,
  skeletonRows = 5,
  emptyMessage = 'Keine Einträge vorhanden',
  emptyIcon,
}: DataTableProps<TData, TValue>) {
  // Build columns with selection and actions
  const columns = useMemo(() => {
    const cols = [...rawColumns] as ColumnDef<TData, TValue>[];

    // Add selection checkbox column
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
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>);
    }

    // Add actions column with hover reveal
    if (renderRowActions) {
      cols.push({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-end gap-1">
            {renderRowActions({ row })}
          </div>
        ),
        size: 120,
        enableSorting: false,
        enableHiding: false,
      } as ColumnDef<TData, TValue>);
    }

    return cols;
  }, [rawColumns, enableRowSelection, renderRowActions]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? [],
      globalFilter: globalFilter ?? '',
      ...(pagination ? { pagination } : {}),
      ...(enableRowSelection && rowSelection != null ? { rowSelection } : {}),
      ...(columnVisibility ? { columnVisibility } : {}),
    },
    onSortingChange: onSortingChange ?? undefined,
    onGlobalFilterChange: onGlobalFilterChange ?? undefined,
    onPaginationChange: onPaginationChange ?? undefined,
    onRowSelectionChange: onRowSelectionChange ?? undefined,
    onColumnVisibilityChange: onColumnVisibilityChange ?? undefined,
    getRowId: getRowId ?? ((row: TData) => (row as Record<string, string>)._id ?? (row as Record<string, string>).id),
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting
      ? { manualSorting: true }
      : { getSortedRowModel: getSortedRowModel() }),
    ...(manualPagination
      ? { manualPagination: true, rowCount }
      : { getPaginationRowModel: getPaginationRowModel() }),
    ...(manualFiltering
      ? { manualFiltering: true }
      : { getFilteredRowModel: getFilteredRowModel() }),
    enableRowSelection,
  });

  const handleRowClick = useCallback(
    (row: Row<TData>) => {
      if (onRowClick) {
        onRowClick(row);
      }
    },
    [onRowClick]
  );

  // Get selected row IDs for bulk actions
  const selectedIds = useMemo(() => {
    if (!enableRowSelection || !rowSelection) return [];
    return Object.keys(rowSelection).filter((id) => rowSelection[id]);
  }, [enableRowSelection, rowSelection]);

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      {/* Toolbar */}
      <DataTableToolbar
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={onGlobalFilterChange}
        enableGlobalFilter={enableGlobalFilter}
        enableColumnVisibility={enableColumnVisibility}
        toolbarActions={toolbarActions}
      >
        {toolbarChildren}
      </DataTableToolbar>

      {/* Bulk actions bar */}
      {bulkActions && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/20">
          <span className="text-sm font-medium text-primary">
            {selectedIds.length} ausgewählt
          </span>
          {bulkActions(selectedIds)}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-b border-border/40 bg-muted/30 hover:bg-muted/30"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
                      header.column.getCanSort() &&
                        'cursor-pointer select-none hover:text-foreground transition-colors'
                    )}
                    style={{
                      width:
                        header.getSize() !== 150 ? header.getSize() : undefined,
                    }}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow
                  key={`skeleton-${i}`}
                  className="border-b border-border/30"
                >
                  {columns.map((_, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    {emptyIcon ?? <Inbox className="h-8 w-8 opacity-40" />}
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'group/row border-b border-border/30 transition-colors',
                    onRowClick && 'cursor-pointer',
                    row.getIsSelected() && 'bg-primary/5',
                    activeRowId &&
                      row.id === activeRowId &&
                      'bg-primary/10 border-l-2 border-l-primary'
                  )}
                  onClick={() => handleRowClick(row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination table={table} />
    </div>
  );
}
