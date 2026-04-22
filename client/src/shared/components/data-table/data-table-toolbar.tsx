'use client';

import type { Table } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  enableGlobalFilter?: boolean;
  enableColumnVisibility?: boolean;
  toolbarActions?: (table: Table<TData>) => React.ReactNode;
  children?: React.ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  globalFilter = '',
  onGlobalFilterChange,
  enableGlobalFilter = true,
  enableColumnVisibility = true,
  toolbarActions,
  children,
}: DataTableToolbarProps<TData>) {
  const isFiltered = globalFilter.length > 0;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
      <div className="flex items-center gap-2 flex-1">
        {toolbarActions?.(table)}
        {children}
      </div>

      <div className="flex items-center gap-2">
        {enableGlobalFilter && (
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={globalFilter}
              onChange={(e) => onGlobalFilterChange?.(e.target.value)}
              className="h-9 pl-9 pr-8 rounded-lg bg-muted/40 border-border/60 text-sm"
            />
            {isFiltered && (
              <button
                onClick={() => onGlobalFilterChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {enableColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 rounded-lg">
                <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                Spalten
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Spalten ein-/ausblenden</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {typeof column.columnDef.header === 'string'
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
