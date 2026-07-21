'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CalendarDays, CheckCircle2, Circle, CircleDashed, CirclePause, CircleX,
  Filter, Flag, ListTodo, Plus, Search, UserRound,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { taskApi } from '@/modules/tasks/services/task-api';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import { TaskListView } from '@/modules/tasks/ui/task-list-view';
import TaskDetailDrawer from '@/modules/tasks/ui/task-detail-drawer';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  taskStatusIconColor,
} from '@/modules/tasks/ui/task-ui-constants';

const ALL = 'ALL';

function projectTaskKeys(projectId) {
  return {
    list: ['pm', 'projectTasks', projectId],
    summary: ['pm', 'projectTasks', projectId, 'summary'],
  };
}

// ── Summary panel ─────────────────────────────────────────────
export function ProjectTaskSummaryPanel({ projectId }) {
  const { t } = useLanguage();
  const keys = projectTaskKeys(projectId);
  const { data: summary, isLoading } = useQuery({
    queryKey: keys.summary,
    queryFn: () => taskApi.projectSummary(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;
  if (!summary) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('pm.tasks', 'Aufgaben')}</p>
          <p className="mt-1 text-sm font-medium">{summary.completed}/{summary.total} {t('pm.tasksCompleted', 'abgeschlossen')}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{summary.completionRate}%</p>
          <p className="text-xs text-muted-foreground">{t('pm.taskProgress', 'Fortschritt')}</p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(summary.completionRate, 100)}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          { key: 'OPEN', label: t('tasks.status.OPEN', 'Offen'), value: summary.open },
          { key: 'IN_PROGRESS', label: t('tasks.status.IN_PROGRESS', 'In Bearbeitung'), value: summary.inProgress },
          { key: 'ON_HOLD', label: t('tasks.status.ON_HOLD', 'Pausiert'), value: summary.onHold },
          { key: 'COMPLETED', label: t('tasks.status.COMPLETED', 'Abgeschlossen'), value: summary.completed },
        ].map((item) => (
          <div key={item.key} className="rounded-md bg-muted/60 px-3 py-2">
            <p className="text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────
export function ProjectTasksTab({ projectId }) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const keys = useMemo(() => projectTaskKeys(projectId), [projectId]);

  // ── Filters ───────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Task creation ─────────────────────────────────────────
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPriority, setNewPriority] = useState('NONE');
  const [newDueDate, setNewDueDate] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // ── Selection & detail ────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Data ──────────────────────────────────────────────────
  const { data: usersData } = useWorkspaceUsers();
  const users = usersData ?? [];

  const params = useMemo(() => ({
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
    ...(statusFilter !== ALL ? { status: statusFilter } : {}),
    ...(priorityFilter !== ALL ? { priority: priorityFilter } : {}),
    ...(searchQuery.trim().length >= 2 ? { q: searchQuery.trim() } : {}),
  }), [statusFilter, priorityFilter, searchQuery]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...keys.list, params],
    queryFn: () => taskApi.projectTasks(projectId, params),
    enabled: !!projectId,
    staleTime: 20_000,
  });

  const tasks = data?.data || [];

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : undefined),
    [selectedTaskId, tasks],
  );

  // ── Mutations ─────────────────────────────────────────────
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: keys.list });
    queryClient.invalidateQueries({ queryKey: keys.summary });
  }, [queryClient, keys]);

  const createMut = useMutation({
    mutationFn: (taskData) => taskApi.create({ ...taskData, projectId }),
    onSuccess: () => {
      setNewTitle('');
      setNewAssignee('');
      setNewPriority('NONE');
      setNewDueDate('');
      setShowCreateForm(false);
      invalidate();
      toast.success(language === 'de' ? 'Aufgabe erstellt' : 'Task created');
    },
    onError: (err) => toast.error(err.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, patch }) => taskApi.patch(id, patch),
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => taskApi.remove(id),
    onSuccess: () => {
      invalidate();
      if (selectedTaskId) { setSelectedTaskId(null); setDrawerOpen(false); }
      toast.success(language === 'de' ? 'Aufgabe gelöscht' : 'Task deleted');
    },
    onError: (err) => toast.error(err.message),
  });

  const duplicateMut = useMutation({
    mutationFn: (id) => taskApi.duplicate(id),
    onSuccess: () => {
      invalidate();
      toast.success(language === 'de' ? 'Aufgabe dupliziert' : 'Task duplicated');
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Handlers ──────────────────────────────────────────────
  const handleSelectTask = useCallback((taskId) => {
    setSelectedTaskId(taskId);
    setDrawerOpen(true);
  }, []);

  const handlePatchTask = useCallback((id, patch) => {
    patchMut.mutate({ id, patch });
  }, [patchMut]);

  const handleDeleteTask = useCallback((id) => {
    deleteMut.mutate(id);
  }, [deleteMut]);

  const handleDuplicate = useCallback((id) => {
    duplicateMut.mutate(id);
  }, [duplicateMut]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    createMut.mutate({
      title,
      priority: newPriority,
      ...(newAssignee ? { assigneeId: newAssignee } : {}),
      ...(newDueDate ? { dueDate: newDueDate } : {}),
    });
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <ProjectTaskSummaryPanel projectId={projectId} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'de' ? 'Aufgaben suchen...' : 'Search tasks...'}
                className="h-9 pl-8"
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              {language === 'de' ? 'Neue Aufgabe' : 'New task'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-80">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{language === 'de' ? 'Alle Status' : 'All statuses'}</SelectItem>
                {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{getTaskStatusLabel(t, s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{language === 'de' ? 'Alle Prioritäten' : 'All priorities'}</SelectItem>
                {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{getTaskPriorityLabel(t, p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <form onSubmit={handleCreateSubmit} className="border-b border-border bg-muted/20 px-3 py-3 animate-in fade-in slide-in-from-top-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_140px_140px_auto]">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={language === 'de' ? 'Aufgabentitel...' : 'Task title...'}
                className="h-9"
                autoFocus
              />
              <Select value={newAssignee || 'none'} onValueChange={(v) => setNewAssignee(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs">
                  <UserRound className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder={language === 'de' ? 'Zuweisen' : 'Assign'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{language === 'de' ? 'Nicht zugewiesen' : 'Unassigned'}</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger className="h-9 text-xs">
                  <Flag className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{getTaskPriorityLabel(t, p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-9 text-xs"
              />
              <Button type="submit" size="sm" className="h-9" disabled={!newTitle.trim() || createMut.isPending}>
                {language === 'de' ? 'Erstellen' : 'Create'}
              </Button>
            </div>
          </form>
        )}

        {/* Task list */}
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : isError ? (
          <div className="p-6">
            <EmptyState
              title={language === 'de' ? 'Aufgaben konnten nicht geladen werden' : 'Tasks could not be loaded'}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry', 'Wiederholen')}</Button>}
            />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ListTodo}
              title={language === 'de' ? 'Keine Aufgaben' : 'No tasks'}
              description={language === 'de' ? 'Aufgaben für dieses Projekt erscheinen hier.' : 'Tasks for this project appear here.'}
            />
          </div>
        ) : (
          <div className="h-[500px]">
            <TaskListView
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              hasNextPage={false}
              isFetchingNextPage={false}
              onFetchNextPage={() => {}}
              onSelectTask={handleSelectTask}
              onPatchTask={handlePatchTask}
              onDeleteTask={handleDeleteTask}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              users={users}
              onDuplicateTask={handleDuplicate}
            />
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        isLoading={false}
        onOpenChange={setDrawerOpen}
        onPatchTask={handlePatchTask}
        onTaskRefresh={(id) => invalidate()}
        users={users}
        onDuplicateTask={handleDuplicate}
      />
    </div>
  );
}
