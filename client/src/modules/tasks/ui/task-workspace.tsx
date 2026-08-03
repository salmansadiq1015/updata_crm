'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useTaskRealtime } from '../hooks/use-task-realtime';
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
// eslint-disable-next-line import/no-unresolved
import { useUiConfig } from '@/shared/hooks/use-ui-config';
import { useAuthStore } from '@/stores/auth-store';
import { useBreadcrumbLabel } from '@/stores/breadcrumb-store';

type TaskWorkspaceProps = {
  listId?: string;
};

export function TaskWorkspace({ listId }: TaskWorkspaceProps) {
  const { t } = useLanguage();
  const router = useRouter();
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
  const setSearch = useTaskWorkspaceStore((state) => state.setSearch);
  const setStatus = useTaskWorkspaceStore((state) => state.setStatus);
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
    ...(savedView === 'dueToday' ? { dueToday: true } : {}),
    ...(savedView === 'overdue' ? { overdue: true } : {}),
    ...(savedView === 'pool' ? { inPool: true } : {}),
    hasParent: false,
  }), [debouncedSearch, department, listId, priority, resolvedAssigneeId, savedView, status]);

  const taskPageSize = activeView === 'calendar' || activeView === 'timeline'
    ? Math.max(pageSize, 100)
    : pageSize;
  const taskParams = useMemo(() => toTaskParams(filters, taskPageSize), [filters, taskPageSize]);
  const listsQuery = useTaskListsV2();
  useBreadcrumbLabel(listId, (listsQuery.data ?? []).find((l) => l.id === listId)?.name);
  const tasksQuery = useTaskWindow(taskParams);

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
  const hasFilters = Boolean(search || status !== 'ALL' || priority !== 'ALL' || assigneeFilter !== 'ALL' || savedView !== 'none');

  const content = (() => {
    if (tasksQuery.isLoading) return activeView === 'board' ? <TaskBoardSkeleton /> : <TaskListSkeleton />;
    if (tasksQuery.isError) {
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
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <TaskSidebar
        folders={foldersQuery.data?.folders ?? []}
        standaloneLists={standaloneLists}
        activeListId={listId}
        activeSavedView={savedView}
        collapsed={sidebarCollapsed}
        collapsedFolderIds={sidebarState.collapsedFolderIds}
        onCollapseChange={setSidebarCollapsed}
        onToggleFolder={toggleFolderCollapsed}
        onSelectList={(nextListId) => router.push(nextListId ? `/tasks/${nextListId}` : '/tasks/all')}
        onSelectSavedView={setSavedView}
        onCreateFolder={() => setDlg({ kind: 'createFolder' })}
        onCreateList={(folderId) => setDlg({ kind: 'createList', folderId: folderId ?? null })}
        onFolderAction={handleFolderAction}
        onListAction={handleListAction}
        onListColorChange={(listId, _folderId, color) => updateList.mutate({ id: listId, data: { color } })}
        onFolderColorChange={(folderId, color) => updateFolder.mutate({ id: folderId, patch: { color } })}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <TaskCommandBar
          activeView={activeView}
          search={search}
          status={status}
          priority={priority}
          assigneeFilter={assigneeFilter}
          users={usersQuery.data ?? []}
          currentUserId={currentUserId}
          isStale={tasksQuery.isStale}
          isFetching={tasksQuery.isFetching}
          onViewChange={setActiveView}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onPriorityChange={setPriority}
          onAssigneeFilterChange={setAssigneeFilter}
          department={department}
          onDepartmentChange={setDepartment}
          onCreateTask={(title) => mutations.createTask.mutate(title)}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-hidden border-t border-border bg-card">
            {content}
          </div>
        </main>
        {/* Microsoft-To-Do-style capture row: always available in the list
            view, including when the list is empty. */}
        {activeView === 'list' && (
          <div className="shrink-0 border-t border-border bg-card px-3 py-2">
            <TaskQuickAdd
              asRow
              onCreate={(title) => mutations.createTask.mutate(title)}
              label={t('tasks.addTaskRow', 'Aufgabe hinzufügen')}
            />
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
