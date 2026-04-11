'use client';

import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';

export function DataTableShell({
  columns,
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
}) {
  const table = useMaterialReactTable({
    columns,
    data,
    state: {
      isLoading,
      pagination,
      sorting,
      globalFilter,
      showProgressBars: isLoading,
      ...(enableRowSelection && rowSelection != null ? { rowSelection } : {}),
    },
    rowCount,
    onPaginationChange,
    onSortingChange,
    onGlobalFilterChange,
    manualPagination,
    manualSorting,
    manualFiltering,
    enableGlobalFilter,
    enableColumnFilters: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableRowSelection,
    onRowSelectionChange,
    getRowId: getRowId || ((row) => row._id),
    renderTopToolbarCustomActions,
    enableRowActions: !!renderRowActions,
    renderRowActions,
    positionActionsColumn: 'last',
    muiTablePaperProps: {
      elevation: 0,
      sx: {
        borderRadius: '0.75rem',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        color: 'var(--card-foreground)',
        overflow: 'hidden',
      },
    },
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: 'var(--muted)',
        color: 'var(--muted-foreground)',
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
      },
    },
    muiTableBodyCellProps: {
      sx: {
        fontSize: '0.875rem',
        borderBottom: '1px solid var(--border)',
      },
    },
    muiTableBodyRowProps: ({ row }) => ({
      sx: {
        '&:hover': { backgroundColor: 'var(--muted)' },
        ...(row.getIsSelected?.() ? { backgroundColor: 'var(--accent)' } : {}),
        cursor: 'default',
      },
    }),
    muiTopToolbarProps: {
      sx: {
        backgroundColor: 'var(--card)',
        borderBottom: '1px solid var(--border)',
      },
    },
    muiBottomToolbarProps: {
      sx: {
        backgroundColor: 'var(--card)',
        borderTop: '1px solid var(--border)',
      },
    },
    muiSelectCheckboxProps: {
      sx: {
        color: 'var(--muted-foreground)',
        '&.Mui-checked': { color: 'var(--primary)' },
      },
    },
    muiSelectAllCheckboxProps: {
      sx: {
        color: 'var(--muted-foreground)',
        '&.Mui-checked': { color: 'var(--primary)' },
      },
    },
    localization: {
      actions: 'Aktionen',
      noRecordsToDisplay: 'Keine Eintraege vorhanden',
      rowsPerPage: 'Zeilen pro Seite',
      search: 'Suchen...',
      of: 'von',
    },
  });

  return <MaterialReactTable table={table} />;
}
