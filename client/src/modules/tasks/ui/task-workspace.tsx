'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTaskRealtime } from '../hooks/use-task-realtime';
import { TaskBulkActionBar } from './task-bulk-action-bar';
import {
  toTaskParams,
  useFlattenedTasks,
  useTaskDetailV2,
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
import type { TaskFilters, TaskPatch } from '../types/task-types';
import { TaskBoardSkeleton, TaskListSkeleton } from './task-skeletons';
import { TaskBoardView } from './task-board-view';
import { TaskCommandBar } from './task-command-bar';
import { TaskEmptyState } from './task-empty-state';
import { TaskListView } from './task-list-view';
import { TaskSidebar } from './task-sidebar';

const TaskDetailDrawer = dynamic(() => import('./task-detail-drawer'), {
  ssr: false,
  loading: () => null,
});

type TaskWorkspaceProps = {
  listId?: string;
};

export function TaskWorkspace({ listId }: TaskWorkspaceProps) {
  const router = useRouter();
  const viewState = useTaskWorkspaceViewState();
  const {
    activeView,
    sidebarCollapsed,
    selectedTaskId,
    search,
    status,
    priority,
    savedView,
  } = viewState;
  const setActiveView = useTaskWorkspaceStore((state) => state.setActiveView);
  const setSidebarCollapsed = useTaskWorkspaceStore((state) => state.setSidebarCollapsed);
  const setSelectedTaskId = useTaskWorkspaceStore((state) => state.setSelectedTaskId);
  const setSearch = useTaskWorkspaceStore((state) => state.setSearch);
  const setStatus = useTaskWorkspaceStore((state) => state.setStatus);
  const setPriority = useTaskWorkspaceStore((state) => state.setPriority);
  const setSavedView = useTaskWorkspaceStore((state) => state.setSavedView);
  const clearFilters = useTaskWorkspaceStore((state) => state.clearFilters);
  const toggleFolderCollapsed = useTaskWorkspaceStore((s) => s.toggleFolderCollapsed);
  const setRowSelection = useTaskWorkspaceStore((s) => s.setRowSelection);
  const pageSize = useTaskWorkspaceStore((s) => s.pageSize);
  const setPageSize = useTaskWorkspaceStore((s) => s.setPageSize);

  // Folder / user / bulk data
  const foldersQuery = useFolders();
  const { createFolder, updateFolder, deleteFolder } = useFolderMutations();
  const usersQuery = useWorkspaceUsers();
  const { createList, updateList, removeList, archiveList } = useTaskListMutations();
  const { bulkUpdateStatus, bulkUpdatePriority, bulkDelete } = useTaskMutations();
  const selectedTaskIds = useSelectedTaskIds();
  const rowSelection = useRowSelection();
  const sidebarState = useTaskSidebarState();

  // Folder/list dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [actionTarget, setActionTarget] = useState<{ type: string; target: any } | null>(null);

  // Folder action handlers
  const handleFolderAction = (action: string, folder: any) => {
    if (action === 'delete') {
      deleteFolder.mutate(folder.id);
    } else if (action === 'rename') {
      setActionTarget({ type: 'renameFolder', target: folder });
      setFolderNameInput(folder.name);
      setFolderDialogOpen(true);
    }
    // changeColor: can be wired to a color picker dialog in a future iteration
  };

  const handleListAction = (action: string, list: any, _folderId: string | null) => {
    if (action === 'archive') {
      archiveList.mutate(list.id);
    } else if (action === 'delete') {
      removeList.mutate(list.id);
    } else if (action === 'rename') {
      // Inline rename can be added later; for now a simple prompt as placeholder
      const newName = window.prompt('Rename list', list.name);
      if (newName && newName.trim() && newName.trim() !== list.name) {
        updateList.mutate({ id: list.id, data: { name: newName.trim() } });
      }
    }
    // changeColor, moveToFolder: can be wired to dialogs in future iterations
  };

  const handleFolderDialogConfirm = () => {
    if (!folderNameInput.trim()) return;
    if (actionTarget?.type === 'createFolder') {
      createFolder.mutate({ name: folderNameInput.trim() });
    } else if (actionTarget?.type === 'renameFolder') {
      updateFolder.mutate({ id: actionTarget.target.id, patch: { name: folderNameInput.trim() } });
    }
    setFolderDialogOpen(false);
  };

  const debouncedSearch = useDebounce(search, 280);

  const filters = useMemo<TaskFilters>(() => ({
    ...(listId ? { listId } : {}),
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(priority !== 'ALL' ? { priority } : {}),
    ...(savedView === 'dueToday' ? { dueToday: true } : {}),
    ...(savedView === 'overdue' ? { overdue: true } : {}),
    hasParent: false,
  }), [debouncedSearch, listId, priority, savedView, status]);

  const taskParams = useMemo(() => toTaskParams(filters, pageSize), [filters, pageSize]);
  const listsQuery = useTaskListsV2();
  const tasksQuery = useTaskWindow(taskParams);

  // Compute standalone lists (not in any folder, not archived)
  const standaloneLists = useMemo(() => {
    const folderListIds = new Set(
      (foldersQuery.data?.folders ?? []).flatMap((f: any) => (f.lists ?? []).map((l: any) => l.id))
    );
    return (listsQuery.data ?? []).filter((l: any) => !folderListIds.has(l.id) && !l.isArchived);
  }, [foldersQuery.data, listsQuery.data]);
  const tasks = useFlattenedTasks(tasksQuery.data);
  const detailQuery = useTaskDetailV2(selectedTaskId);
  const mutations = useTaskWorkspaceMutations(taskParams);

  useTaskRealtime();

  const patchTask = (id: string, patch: TaskPatch) => mutations.patchTask.mutate({ id, patch });
  const hasFilters = Boolean(search || status !== 'ALL' || priority !== 'ALL' || savedView !== 'none');

  const content = (() => {
    if (tasksQuery.isLoading) return activeView === 'board' ? <TaskBoardSkeleton /> : <TaskListSkeleton />;
    if (tasksQuery.isError) {
      return <TaskEmptyState type={typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'} onRetry={() => tasksQuery.refetch()} />;
    }
    if (tasks.length === 0) return <TaskEmptyState type={hasFilters ? 'filtered' : 'empty'} onReset={clearFilters} />;
    if (activeView === 'board') {
      return (
        <TaskBoardView
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={setSelectedTaskId}
          onPatchTask={patchTask}
          users={usersQuery.data ?? []}
        />
      );
    }
    if (activeView === 'calendar' || activeView === 'timeline') {
      return <TaskEmptyState type="empty" />;
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
        onSelectTask={setSelectedTaskId}
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
        onCreateFolder={() => {
          setFolderNameInput('');
          setActionTarget({ type: 'createFolder', target: null });
          setFolderDialogOpen(true);
        }}
        onCreateList={(folderId) => {
          const listName = window.prompt('New list name');
          if (listName && listName.trim()) {
            createList.mutate({ name: listName.trim(), ...(folderId ? { folderId } : {}) });
          }
        }}
        onFolderAction={handleFolderAction}
        onListAction={handleListAction}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <TaskCommandBar
          activeView={activeView}
          search={search}
          status={status}
          priority={priority}
          isStale={tasksQuery.isStale}
          isFetching={tasksQuery.isFetching}
          onViewChange={setActiveView}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onPriorityChange={setPriority}
          onCreateTask={(title) => mutations.createTask.mutate(title)}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-hidden border-t border-border bg-card">
            {content}
          </div>
        </main>
      </section>

      <TaskDetailDrawer
        task={detailQuery.data}
        open={Boolean(selectedTaskId)}
        isLoading={detailQuery.isLoading}
        onOpenChange={(open) => {
          if (!open) setSelectedTaskId(null);
        }}
        onPatchTask={patchTask}
        users={usersQuery.data ?? []}
        onDuplicateTask={(id) => mutations.duplicateTask.mutate(id)}
      />

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

      {/* Folder create / rename dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === 'createFolder' ? 'New Folder' : 'Rename Folder'}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={folderNameInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolderNameInput(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') handleFolderDialogConfirm();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFolderDialogConfirm} disabled={!folderNameInput.trim()}>
              {actionTarget?.type === 'createFolder' ? 'Create' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
