'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTasks } from '../hooks/use-task-queries';
import { useTaskMutations } from '../hooks/use-task-mutations';
import { TaskFormDialog } from './task-form-dialog';
import { TaskDetailPanel } from './task-detail-panel';
import { TaskStatusBadge } from './task-status-badge';
import { TaskPriorityBadge } from './task-priority-badge';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '../constants/task-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { CheckSquare, Eye, Pencil, Plus, Trash2, RefreshCw, CircleCheck } from 'lucide-react';

// ── Empty state ───────────────────────────────────────────────────────────────

function TasksEmptyState({ de }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/15" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <CheckSquare className="h-7 w-7 text-primary animate-bounce" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">{de ? 'Keine Aufgaben gefunden' : 'No tasks found'}</p>
        <p className="text-xs text-muted-foreground">
          {de ? 'Erstellen Sie eine neue Aufgabe oder ändern Sie die Filter.' : 'Create a new task or adjust your filters.'}
        </p>
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, colorClass }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex flex-col gap-1 min-w-[100px]">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={cn('text-2xl font-bold', colorClass)}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TasksTable({ listId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});

  const debouncedSearch = useDebounce(search, 300);

  const {
    createTask, updateTask, removeTask,
    changeStatus, completeTask, reopenTask,
    bulkUpdateStatus, bulkDelete,
  } = useTaskMutations();

  const filters = useMemo(() => {
    const f = {};
    if (listId) f.listId = listId;
    if (debouncedSearch) f.q = debouncedSearch;
    if (status !== 'all') f.status = status;
    if (priority !== 'all') f.priority = priority;
    return f;
  }, [listId, debouncedSearch, status, priority]);

  const { data: tasksData, isFetching } = useTasks(filters);
  const tasks = Array.isArray(tasksData) ? tasksData : (tasksData?.data ?? []);

  const stats = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((t) => t.status === 'OPEN').length,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    completed: tasks.filter((t) => t.status === 'COMPLETED').length,
  }), [tasks]);

  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, v]) => v).map(([k]) => k),
    [rowSelection],
  );

  const columns = useMemo(() => [
    {
      accessorKey: 'title',
      header: de ? 'Titel' : 'Title',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setDetailTarget(row.original)}
          className="text-left font-medium hover:text-primary transition-colors line-clamp-1 max-w-[300px]"
        >
          {row.original.title}
        </button>
      ),
    },
    {
      accessorKey: 'status',
      header: de ? 'Status' : 'Status',
      cell: ({ row }) => <TaskStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'priority',
      header: de ? 'Priorität' : 'Priority',
      cell: ({ row }) => <TaskPriorityBadge priority={row.original.priority} size="sm" />,
    },
    {
      accessorKey: 'assigneeId',
      header: de ? 'Zugewiesen' : 'Assignee',
      cell: ({ row }) => {
        const a = row.original.assigneeId;
        if (!a) return <span className="text-muted-foreground text-xs">—</span>;
        const name = typeof a === 'object' ? `${a.firstName || ''} ${a.lastName || ''}`.trim() : a;
        return <span className="text-sm">{name || '—'}</span>;
      },
    },
    {
      accessorKey: 'dueDate',
      header: de ? 'Fällig' : 'Due',
      cell: ({ row }) => {
        const d = row.original.dueDate;
        if (!d) return <span className="text-muted-foreground text-xs">—</span>;
        const isOverdue = new Date(d) < new Date() && row.original.status !== 'COMPLETED';
        return (
          <span className={cn('text-xs', isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
            {formatDate(d)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <RowActionsMenu
          actions={[
            {
              label: de ? 'Anzeigen' : 'View',
              icon: Eye,
              onClick: () => setDetailTarget(row.original),
            },
            {
              label: de ? 'Bearbeiten' : 'Edit',
              icon: Pencil,
              onClick: () => setEditTarget(row.original),
            },
            row.original.status !== 'COMPLETED'
              ? {
                  label: de ? 'Abschliessen' : 'Complete',
                  icon: CircleCheck,
                  onClick: () => completeTask.mutate({ id: row.original._id }),
                }
              : {
                  label: de ? 'Wieder öffnen' : 'Reopen',
                  icon: RefreshCw,
                  onClick: () => reopenTask.mutate(row.original._id),
                },
            {
              label: de ? 'Löschen' : 'Delete',
              icon: Trash2,
              variant: 'destructive',
              onClick: () => setDeleteTarget(row.original),
            },
          ]}
        />
      ),
    },
  ], [de, completeTask, reopenTask]);

  const handleCreate = useCallback((data) => {
    createTask.mutate({ ...data, ...(listId && { listId }) }, {
      onSuccess: () => setShowCreate(false),
    });
  }, [createTask, listId]);

  const handleUpdate = useCallback((data) => {
    if (!editTarget) return;
    updateTask.mutate({ id: editTarget._id, data }, {
      onSuccess: () => setEditTarget(null),
    });
  }, [updateTask, editTarget]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    removeTask.mutate(deleteTarget._id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [removeTask, deleteTarget]);

  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(selectedIds, {
      onSuccess: () => { setRowSelection({}); setBulkDeleteOpen(false); },
    });
  }, [bulkDelete, selectedIds]);

  const clear = useCallback(() => { setSearch(''); setStatus('all'); setPriority('all'); }, []);

  const hasFilters = !!debouncedSearch || status !== 'all' || priority !== 'all';

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <StatCard label={de ? 'Gesamt' : 'Total'} value={stats.total} colorClass="text-foreground" />
        <StatCard label={de ? 'Offen' : 'Open'} value={stats.open} colorClass="text-slate-600" />
        <StatCard label={de ? 'In Arbeit' : 'In Progress'} value={stats.inProgress} colorClass="text-blue-600" />
        <StatCard label={de ? 'Erledigt' : 'Done'} value={stats.completed} colorClass="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={de ? 'Suchen...' : 'Search...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 text-sm"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder={de ? 'Status' : 'Status'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{de ? 'Alle Status' : 'All statuses'}</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{de ? TASK_STATUS_CONFIG[s]?.label : TASK_STATUS_CONFIG[s]?.labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder={de ? 'Priorität' : 'Priority'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{de ? 'Alle Prioritäten' : 'All priorities'}</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>{de ? TASK_PRIORITY_CONFIG[p]?.label : TASK_PRIORITY_CONFIG[p]?.labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-8 text-xs">
            {de ? 'Filter zurücksetzen' : 'Clear filters'}
          </Button>
        )}
        <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          {de ? 'Neue Aufgabe' : 'New Task'}
        </Button>
      </div>

      {/* Table */}
      <DataTableShell
        data={tasks}
        columns={columns}
        isLoading={isFetching}
        emptyState={<TasksEmptyState de={de} />}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row._id}
      />

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <BulkActionsBar
          count={selectedIds.length}
          actions={[
            {
              label: de ? 'Als erledigt markieren' : 'Mark complete',
              onClick: () => bulkUpdateStatus.mutate({ taskIds: selectedIds, status: 'COMPLETED' }),
              isLoading: bulkUpdateStatus.isPending,
            },
            {
              label: de ? 'Löschen' : 'Delete',
              variant: 'destructive',
              onClick: () => setBulkDeleteOpen(true),
            },
          ]}
          onClear={() => setRowSelection({})}
        />
      )}

      {/* Dialogs */}
      <TaskFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isLoading={createTask.isPending}
      />
      <TaskFormDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onSubmit={handleUpdate}
        initial={editTarget}
        isLoading={updateTask.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={de ? 'Aufgabe löschen?' : 'Delete task?'}
        description={de ? `"${deleteTarget?.title}" wird dauerhaft gelöscht.` : `"${deleteTarget?.title}" will be permanently deleted.`}
        confirmLabel={de ? 'Löschen' : 'Delete'}
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={removeTask.isPending}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={de ? `${selectedIds.length} Aufgaben löschen?` : `Delete ${selectedIds.length} tasks?`}
        description={de ? 'Diese Aktion kann nicht rückgängig gemacht werden.' : 'This action cannot be undone.'}
        confirmLabel={de ? 'Löschen' : 'Delete'}
        variant="destructive"
        onConfirm={handleBulkDelete}
        isLoading={bulkDelete.isPending}
      />

      {/* Detail panel */}
      <TaskDetailPanel
        task={detailTarget}
        open={!!detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onEdit={(task) => { setDetailTarget(null); setEditTarget(task); }}
      />
    </div>
  );
}
