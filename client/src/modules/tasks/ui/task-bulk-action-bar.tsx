'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from './confirm-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { TASK_PRIORITIES, TASK_STATUSES, getTaskPriorityLabel, getTaskStatusLabel } from './task-ui-constants';

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
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  return (
    <>
    <ConfirmDialog
      open={confirmOpen}
      title={t('tasks.deleteSelectedTitle', 'Aufgaben loeschen')}
      description={t('tasks.deleteSelectedDesc', '{count} Aufgabe(n) loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.', { count: selectedIds.length })}
      confirmLabel={t('common.delete', 'Loeschen')}
      destructive
      onConfirm={() => { setConfirmOpen(false); onDelete(); }}
      onCancel={() => setConfirmOpen(false)}
    />
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-border bg-card shadow-2xl px-4 py-2.5 animate-in slide-in-from-bottom-2">
      <span className="text-sm font-medium text-foreground whitespace-nowrap">
        {t('common.selectedCountShort', '{count} ausgewaehlt', { count: selectedIds.length })}
      </span>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Status dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            {t('tasks.status', 'Status')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TASK_STATUSES.map((status) => (
            <DropdownMenuItem key={status} onClick={() => onStatusChange(status)}>
              {getTaskStatusLabel(t, status)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            {t('tasks.priority', 'Prioritaet')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TASK_PRIORITIES.map((priority) => (
            <DropdownMenuItem key={priority} onClick={() => onPriorityChange(priority)}>
              {getTaskPriorityLabel(t, priority)}
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
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {t('common.delete', 'Loeschen')}
      </Button>

      {/* Clear selection */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onClear}
        aria-label={t('common.clearSelection', 'Auswahl aufheben')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
    </>
  );
}
