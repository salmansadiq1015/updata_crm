import type { ColumnDef, Row, Table } from '@tanstack/react-table';

/**
 * Configuration for a faceted filter column in the DataTable toolbar.
 */
export interface FacetedFilterConfig {
  column: string;
  title: string;
  options: Array<{
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
}

/**
 * Props for row action renderers.
 */
export interface RowActionProps<TData> {
  row: Row<TData>;
  table: Table<TData>;
}

/**
 * Extended column definition with additional metadata.
 */
export type DataTableColumnDef<TData, TValue = unknown> = ColumnDef<TData, TValue> & {
  /** Whether this column can be hidden via view options */
  enableHiding?: boolean;
  /** Whether this column supports faceted filtering */
  enableFacetedFilter?: boolean;
};
