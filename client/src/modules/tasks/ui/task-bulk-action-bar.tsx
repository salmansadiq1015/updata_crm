'use client';

import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUSES = [
  { value: 'OPEN', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Complete' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITIES = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

type TaskBulkActionBarProps = {
  selectedIds: string[];
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onDelete: () => void;
  onClear: () => void;
};

export function TaskBulkActionBar({
  selectedIds,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onClear,
}: TaskBulkActionBarProps) {
  if (selectedIds.length === 0) return null;

  const handleDelete = () => {
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.`
    );
    if (confirmed) onDelete();
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-border bg-card shadow-2xl px-4 py-2.5 animate-in slide-in-from-bottom-2">
      <span className="text-sm font-medium text-foreground whitespace-nowrap">
        {selectedIds.length} selected
      </span>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Status dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {STATUSES.map((s) => (
            <DropdownMenuItem key={s.value} onClick={() => onStatusChange(s.value)}>
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            Priority
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p.value} onClick={() => onPriorityChange(p.value)}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Delete with confirmation */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-destructive hover:text-destructive gap-1"
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      {/* Clear selection */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
