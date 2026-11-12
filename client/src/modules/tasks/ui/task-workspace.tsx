'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useTaskRealtime } from '../hooks/use-task-realtime';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { BarChart3, ChevronDown, ClipboardList, ListTodo, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskMetricTiles, type TaskMetricFilter } from './task-metric-tiles';
import { PageBand, heroButton } from '@/shared/components/page-hero';
import { TaskTimeReport } from './task-time-report';
import { TaskDashboardPage } from './task-dashboard-page';
import { TaskBulkActionBar } from './task-bulk-action-bar';
import {
  toTaskParams,
  useFlattenedTasks,
  useTaskListsV2,
  useTaskWindow,
  useTaskWorkspaceMutations,
} from '../hooks/use-task-workspace';
import { useFolders } from '../hooks/use-folder-queries';
import { useFolderMutations } from '../hooks/use-folder-mutations';
import { useWorkspaceUsers } from '../hooks/use-workspace-users';
import { useTaskListMutations, useTaskMutations } from '../hooks/use-task-mutations';
import {
  useRowSelection,
  useSelectedTaskIds,
  useTaskSidebarState,
  useTaskWorkspaceStore,
  useTaskWorkspaceViewState,
} from '../state/task-workspace-store';
import type { TaskFilters, TaskFolderWithLists, TaskList, TaskPatch } from '../types/task-types';
import { TaskBoardSkeleton, TaskListSkeleton } from './task-skeletons';
import { TaskBoardView } from './task-board-view';
import { TaskCalendarView } from './task-calendar-view';
import { TaskTimelineView } from './task-timeline-view';
import { TaskCommandBar } from './task-command-bar';
import { TaskEmptyState } from './task-empty-state';
import { TaskListView } from './task-list-view';
import { TaskQuickAdd } from './task-quick-add';
import { TaskSidebar } from './task-sidebar';
import { InputDialog } from './input-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { useUiConfig } from '@/shared/hooks/use-ui-config';
import { useAuthStore } from '@/stores/auth-store';
import { useBreadcrumbLabel } from '@/stores/breadcrumb-store';

type TaskWorkspaceProps = {
  listId?: string;
};

export function TaskWorkspace({ listId }: TaskWorkspaceProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewState = useTaskWorkspaceViewState();
  const {
    activeView,
    sidebarCollapsed,
    selectedTaskId,
    search,
    status,
    priority,
    assigneeFilter,
    savedView,
  } = viewState;
  const currentUserId = useAuthStore((state: { user?: { _id?: string; id?: string } | null }) =>
    state.user?._id ?? state.user?.id ?? null,
  );
  const setActiveView = useTaskWorkspaceStore((state) => state.setActiveView);
  const setSidebarCollapsed = useTaskWorkspaceStore((state) => state.setSidebarCollapsed);
  const setSelectedTaskId = useTaskWorkspaceStore((state) => state.setSelectedTaskId);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const collapse = () => { if (media.matches) setSidebarCollapsed(true); };
    collapse();
    media.addEventListener('change', collapse);
    return () => media.removeEventListener('change', collapse);
  }, [setSidebarCollapsed]);
  const setSearch = useTaskWorkspaceStore((state) => state.setSearch);
  const setStatus = useTaskWorkspaceStore((state) => state.setStatus);
  // Two tabs: the task list (default) and the analytics that used to sit above it.
  const [tab, setTab] = useState<'tasks' | 'analytics'>('tasks');
  const [timeReportOpen, setTimeReportOpen] = useState(false);

  // Which tile is driving the list. Derived rather than stored, so the tiles
  // stay in step when the filters are changed from the command bar.
  const metricFilter: TaskMetricFilter = savedView === 'overdue' ? 'overdue'
    : savedView === 'active' ? 'open'
      : savedView === 'completedThisWeek' ? 'completedThisWeek' : null;

  const applyMetricFilter = (filter: TaskMetricFilter) => {
    clearFilters();
    setTab('tasks'); // a tile filters the list, so show the list
    if (!filter) return;
    setAssigneeFilter('ME');
    setSavedView(filter === 'open' ? 'active' : filter);
    if (listId) router.push('/tasks');
  };
  const setPriority = useTaskWorkspaceStore((state) => state.setPriority);
  const setAssigneeFilter = useTaskWorkspaceStore((state) => state.setAssigneeFilter);
  const setSavedView = useTaskWorkspaceStore((state) => state.setSavedView);
  const clearFilters = useTaskWorkspaceStore((state) => state.clearFilters);
  const toggleFolderCollapsed = useTaskWorkspaceStore((s) => s.toggleFolderCollapsed);
  const setRowSelection = useTaskWorkspaceStore((s) => s.setRowSelection);
  const pageSize = useTaskWorkspaceStore((s) => s.pageSize);
  const setPageSize = useTaskWorkspaceStore((s) => s.setPageSize);
  const department = useTaskWorkspaceStore((s) => s.department);
  const setDepartment = useTaskWorkspaceStore((s) => s.setDepartment);

  // Apply the role's default filters/view (Key User config) once per session.
  const uiConfig = useUiConfig();
  const seedDefaults = useTaskWorkspaceStore((s) => s.seedDefaults);
  useEffect(() => {
    seedDefaults(uiConfig.taskDefaults);
  }, [seedDefaults, uiConfig.taskDefaults]);

  // Folder / user / bulk data
  const foldersQuery = useFolders();
  const { createFolder, updateFolder, deleteFolder } = useFolderMutations();
  const usersQuery = useWorkspaceUsers();
  const { createList, updateList, removeList, archiveList } = useTaskListMutations();
  const { bulkUpdateStatus, bulkUpdatePriority, bulkDelete } = useTaskMutations();
  const selectedTaskIds = useSelectedTaskIds();
  const rowSelection = useRowSelection();
  const sidebarState = useTaskSidebarState();

  // Dialog state — covers folder create/rename AND list create/rename
  type DialogState =
    | { kind: 'createFolder' }
    | { kind: 'renameFolder'; id: string; current: string }
    | { kind: 'createList'; folderId: string | null }
    | { kind: 'renameList'; id: string; current: string };

  const [dlg, setDlg] = useState<DialogState | null>(null);

  const closeDlg = () => setDlg(null);

  const dlgTitle = dlg
    ? dlg.kind === 'createFolder' ? t('tasks.newFolder', 'Neuer Ordner')
    : dlg.kind === 'renameFolder' ? t('tasks.renameFolder', 'Ordner umbenennen')
    : dlg.kind === 'createList' ? t('tasks.newList', 'Neue Liste')
    : t('tasks.renameList', 'Liste umbenennen')
    : '';

  const dlgDefaultValue = dlg && 'current' in dlg ? dlg.current : '';
  const dlgConfirmLabel = dlg?.kind.startsWith('create') ? t('common.create', 'Erstellen') : t('common.rename', 'Umbenennen');

  const handleDlgConfirm = (value: string) => {
    if (!dlg) return;
    if (dlg.kind === 'createFolder') {
      createFolder.mutate({ name: value });
    } else if (dlg.kind === 'renameFolder') {
      updateFolder.mutate({ id: dlg.id, patch: { name: value } });
    } else if (dlg.kind === 'createList') {
      createList.mutate({ name: value, ...(dlg.folderId ? { folderId: dlg.folderId } : {}) });
    } else if (dlg.kind === 'renameList') {
      updateList.mutate({ id: dlg.id, data: { name: value } });
    }
    closeDlg();
  };

  // Folder action handlers
  const handleFolderAction = (action: string, folder: TaskFolderWithLists) => {
    if (action === 'delete') {
      deleteFolder.mutate(folder.id);
    } else if (action === 'rename') {
      setDlg({ kind: 'renameFolder', id: folder.id, current: folder.name });
    }
  };

  const handleListAction = (action: string, list: TaskList, _folderId: string | null) => {
    if (action === 'archive') {
      archiveList.mutate(list.id);
    } else if (action === 'delete') {
      removeList.mutate(list.id);
    } else if (action === 'rename') {
      setDlg({ kind: 'renameList', id: list.id, current: list.name });
    }
  };

  const debouncedSearch = useDebounce(search, 280);

  const resolvedAssigneeId =
    assigneeFilter === 'ALL' ? undefined
    : assigneeFilter === 'ME' ? (currentUserId ?? undefined)
    : assigneeFilter;

  const filters = useMemo<TaskFilters>(() => ({
    ...(listId ? { listId } : {}),
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(priority !== 'ALL' ? { priority } : {}),
    ...(resolvedAssigneeId ? { assigneeId: resolvedAssigneeId } : {}),
    ...(department !== 'ALL' ? { departmentId: department } : {}),
    ...(savedView === 'active' ? { active: true } : {}),
    ...(savedView === 'completedThisWeek' ? { completedThisWeek: true } : {}),
    ...(savedView === 'dueToday' ? { dueToday: true } : {}),
    ...(savedView === 'overdue' ? { overdue: true } : {}),
    ...(savedView === 'pool' ? { inPool: true } : {}),
    ...(metricFilter ? {} : { hasParent: false }),
  }), [debouncedSearch, department, listId, priority, resolvedAssigneeId, savedView, status, metricFilter]);

  const taskPageSize = activeView === 'calendar' || activeView === 'timeline'
    ? Math.max(pageSize, 100)
    : pageSize;
  const taskParams = useMemo(() => toTaskParams(filters, taskPageSize), [filters, taskPageSize]);
  const listsQuery = useTaskListsV2();
  useBreadcrumbLabel(listId, (listsQuery.data ?? []).find((l) => l.id === listId)?.name);
  const tasksQuery = useTaskWindow(taskParams);
  useEffect(() => { setRowSelection({}); }, [taskParams, setRowSelection]);

  // Compute standalone lists (not in any folder, not archived)
  const standaloneLists = useMemo(() => {
    const folderListIds = new Set(
      (foldersQuery.data?.folders ?? []).flatMap((folder) => (folder.lists ?? []).map((list) => list.id))
    );
    return (listsQuery.data ?? []).filter((list) => !folderListIds.has(list.id) && !list.isArchived);
  }, [foldersQuery.data, listsQuery.data]);
  const tasks = useFlattenedTasks(tasksQuery.data);
  const mutations = useTaskWorkspaceMutations(taskParams);

  useTaskRealtime();

  const patchTask = (id: string, patch: TaskPatch) => mutations.patchTask.mutate({ id, patch });
  const hasFilters = Boolean(search || status !== 'ALL' || priority !== 'ALL' || assigneeFilter !== 'ALL' || savedView !== 'none' || department !== 'ALL');

  const content = (() => {
    if (tasksQuery.isLoading) return activeView === 'board' ? <TaskBoardSkeleton /> : <TaskListSkeleton />;
    if (tasksQuery.isError && !tasksQuery.data) {
      return <TaskEmptyState type={typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'} onRetry={() => tasksQuery.refetch()} />;
    }
    if (tasks.length === 0) return <TaskEmptyState type={hasFilters ? 'filtered' : 'empty'} onReset={clearFilters} />;

    if (activeView === 'calendar') return <TaskCalendarView tasks={tasks} listId={listId} />;
    if (activeView === 'timeline') return <TaskTimelineView tasks={tasks} listId={listId} />;

    if (activeView === 'board') {
      return (
        <TaskBoardView
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={(id) => router.push(`/tasks/${listId ?? 'all'}/${id}`)}
          onPatchTask={patchTask}
          onCreateTask={(title, status) => mutations.createTask.mutate({ title, status })}
          users={usersQuery.data ?? []}
        />
      );
    }
    return (
      <TaskListView
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        hasNextPage={tasksQuery.hasNextPage}
        isFetchingNextPage={tasksQuery.isFetchingNextPage}
        onFetchNextPage={() => {
          if (!tasksQuery.isFetchingNextPage) void tasksQuery.fetchNextPage();
        }}
        onSelectTask={(id) => router.push(`/tasks/${listId ?? 'all'}/${id}`)}
        onPatchTask={patchTask}
        onDeleteTask={(id) => mutations.deleteTask.mutate(id)}
        onDuplicateTask={(id) => mutations.duplicateTask.mutate(id)}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        users={usersQuery.data ?? []}
      />
    );
  })();

  return (
    <div data-testid="task-workspace" className="flex h-full min-h-0 bg-background text-foreground">
      <TaskSidebar
        folders={foldersQuery.data?.folders ?? []}
        standaloneLists={standaloneLists}
        activeListId={listId}
        activeSavedView={savedView}
        collapsed={sidebarCollapsed}
        collapsedFolderIds={sidebarState.collapsedFolderIds}
        onCollapseChange={setSidebarCollapsed}
        onToggleFolder={toggleFolderCollapsed}
        onSelectList={(nextListId) => { clearFilters(); setRowSelection({}); router.push(nextListId ? `/tasks/${nextListId}` : '/tasks'); }}
        onSelectSavedView={setSavedView}
        onCreateFolder={() => setDlg({ kind: 'createFolder' })}
        onCreateList={(folderId) => setDlg({ kind: 'createList', folderId: folderId ?? null })}
        onFolderAction={handleFolderAction}
        onListAction={handleListAction}
        onListColorChange={(listId, _folderId, color) => updateList.mutate({ id: listId, data: { color } })}
        onFolderColorChange={(folderId, color) => updateFolder.mutate({ id: folderId, patch: { color } })}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
          <PageBand
            id="tasks-title"
            art="/hero/tasks"
            icon={ClipboardList}
            eyebrow={t('tasks.title', 'Tasks')}
            title={(listsQuery.data ?? []).find((list) => list.id === listId)?.name ?? t('tasksHero.title', 'Every task, moving forward.')}
            subtitle={t('tasks.workspaceSubtitle', 'Plan, prioritize, and move work forward.')}
            actions={<button type="button" className={heroButton.ghost} disabled={tasksQuery.isFetching} onClick={() => void queryClient.invalidateQueries({ queryKey: ['tasks'] })}><RefreshCw aria-hidden="true" className={cn(tasksQuery.isFetching && 'animate-spin')} />{t('common.refresh', 'Refresh')}</button>}
          />
        </div>
        <div role="tablist" aria-label={t('tasks.tabs.aria', 'Tasks and analytics')} className="flex shrink-0 gap-1 border-b border-border px-4 sm:px-5">
          {([
            { id: 'tasks', icon: ListTodo, label: t('tasks.tabs.tasks', 'Tasks') },
            { id: 'analytics', icon: BarChart3, label: t('tasks.tabs.analytics', 'Analytics') },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" role="tab" id={`tasks-tab-${id}`} aria-selected={tab === id} aria-controls={`tasks-panel-${id}`} onClick={() => setTab(id)}
              className={cn('relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className={cn('h-4 w-4', tab === id && 'text-primary')} aria-hidden="true" />
              {label}
              {id === 'tasks' && <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{tasks.length}{tasksQuery.hasNextPage ? '+' : ''}</span>}
            </button>
          ))}
        </div>

        {tab === 'tasks' ? (
          <>
            <TaskCommandBar
              activeView={activeView}
              search={search}
              status={status}
              priority={priority}
              assigneeFilter={assigneeFilter}
              users={usersQuery.data ?? []}
              currentUserId={currentUserId}
              isStale={tasksQuery.isStale}
              hasError={tasksQuery.isError}
              isFetching={tasksQuery.isFetching}
              onViewChange={setActiveView}
              onSearchChange={setSearch}
              onStatusChange={setStatus}
              onPriorityChange={setPriority}
              onAssigneeFilterChange={setAssigneeFilter}
              department={department}
              onDepartmentChange={setDepartment}
              onCreateTask={(title) => mutations.createTask.mutateAsync(title)}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
            <main id="tasks-panel-tasks" role="tabpanel" aria-labelledby="tasks-tab-tasks" className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
              <div className="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-theme-sm">
                <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <span className="text-xs font-medium text-muted-foreground" aria-live="polite">{t('tasks.loadedCount', '{count} tasks loaded', { count: tasks.length })}{tasksQuery.hasNextPage ? '+' : ''}</span>
                  {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5" />{t('tasks.clearFilters', 'Clear filters')}</Button>}
                </div>
                {tasksQuery.isError && tasksQuery.data && <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-3 text-xs text-muted-foreground">
                  {t('tasks.cachedWarning', 'Showing saved tasks. Refresh to try loading the latest changes.')}
                  <Button size="sm" variant="outline" onClick={() => void tasksQuery.refetch()} disabled={tasksQuery.isFetching}>{t('common.retry', 'Retry')}</Button>
                </div>}
                <div className="min-h-0 flex-1">
                  {content}
                </div>
              </div>
            </main>
            {/* Microsoft-To-Do-style capture row: always available in the list
                view, including when the list is empty. */}
            {activeView === 'list' && (
              <div className="shrink-0 border-t border-border bg-card px-3 py-2">
                <TaskQuickAdd
                  asRow
                  onCreate={(title) => mutations.createTask.mutateAsync(title)}
                  label={t('tasks.addTaskRow', 'Aufgabe hinzufügen')}
                />
              </div>
            )}
          </>
        ) : (
          <div id="tasks-panel-analytics" role="tabpanel" aria-labelledby="tasks-tab-analytics" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                  <h2 className="font-semibold text-foreground">{t('tasks.personalOverview', 'Your workload')}</h2>
                  <span>{t('tasks.personalScope', 'Personal totals across all lists')}</span>
                </div>
                <TaskMetricTiles active={metricFilter} onSelect={applyMetricFilter} />
              </div>
              <TaskDashboardPage embedded />
              <div>
                <button type="button" aria-expanded={timeReportOpen} aria-controls="task-workspace-time-report" onClick={() => setTimeReportOpen((value) => !value)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', timeReportOpen && 'rotate-180')} />{t('tasks.time.report', 'Task time report')}
                </button>
              </div>
              {timeReportOpen && <div id="task-workspace-time-report"><TaskTimeReport /></div>}
            </div>
          </div>
        )}
      </section>

      <TaskBulkActionBar
        selectedIds={selectedTaskIds}
        onStatusChange={(status) => {
          bulkUpdateStatus.mutate(
            { taskIds: selectedTaskIds, status },
            { onSuccess: () => setRowSelection({}) },
          );
        }}
        onPriorityChange={(priority) => {
          bulkUpdatePriority.mutate(
            { taskIds: selectedTaskIds, priority },
            { onSuccess: () => setRowSelection({}) },
          );
        }}
        onDelete={() => {
          bulkDelete.mutate(selectedTaskIds, { onSuccess: () => setRowSelection({}) });
        }}
        onClear={() => setRowSelection({})}
      />

      <InputDialog
        open={Boolean(dlg)}
        title={dlgTitle}
        defaultValue={dlgDefaultValue}
        placeholder={dlg?.kind.includes('older') ? t('tasks.folderName', 'Ordnername') : t('tasks.listName', 'Listenname')}
        confirmLabel={dlgConfirmLabel}
        onConfirm={handleDlgConfirm}
        onCancel={closeDlg}
      />
    </div>
  );
}
