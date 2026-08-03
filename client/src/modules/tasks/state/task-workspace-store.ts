'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { TaskPriority, TaskStatus, TaskViewType } from '../types/task-types';

export type TaskSavedView = 'none' | 'dueToday' | 'overdue' | 'pool';

type TaskWorkspaceState = {
  activeView: TaskViewType;
  sidebarCollapsed: boolean;
  selectedTaskId: string | null;
  search: string;
  status: TaskStatus | 'ALL';
  priority: TaskPriority | 'ALL';
  // 'ALL' = everyone's tasks, 'ME' = only mine, or a specific user id.
  assigneeFilter: string;
  // 'ALL' = every department, or a specific department id.
  department: string;
  savedView: TaskSavedView;
  rowSelection: Record<string, boolean>;
  visibleColumns: Record<string, boolean>;
  activeFolderId: string | null;
  collapsedFolderIds: string[];
  pageSize: number;
  setActiveView: (view: TaskViewType) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  setSearch: (search: string) => void;
  setStatus: (status: TaskStatus | 'ALL') => void;
  setPriority: (priority: TaskPriority | 'ALL') => void;
  setAssigneeFilter: (assigneeFilter: string) => void;
  setDepartment: (department: string) => void;
  setSavedView: (savedView: TaskSavedView) => void;
  setRowSelection: (selection: Record<string, boolean>) => void;
  clearFilters: () => void;
  setActiveFolderId: (id: string | null) => void;
  toggleFolderCollapsed: (folderId: string) => void;
  setPageSize: (n: number) => void;
};

export const useTaskWorkspaceStore = create<TaskWorkspaceState>((set) => ({
  activeView: 'list',
  sidebarCollapsed: false,
  selectedTaskId: null,
  search: '',
  status: 'ALL',
  priority: 'ALL',
  assigneeFilter: 'ALL',
  department: 'ALL',
  savedView: 'none',
  rowSelection: {},
  visibleColumns: {
    title: true,
    status: true,
    priority: true,
    assignee: true,
    dueDate: true,
  },
  activeFolderId: null,
  collapsedFolderIds: [],
  pageSize: 50,
  setActiveView: (activeView) => set({ activeView }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setSearch: (search) => set({ search }),
  setStatus: (status) => set({ status, savedView: 'none' }),
  setPriority: (priority) => set({ priority, savedView: 'none' }),
  setAssigneeFilter: (assigneeFilter) => set({ assigneeFilter }),
  setDepartment: (department) => set({ department }),
  setSavedView: (savedView) => set({ savedView }),
  setRowSelection: (rowSelection) => set({ rowSelection }),
  clearFilters: () => set({ search: '', status: 'ALL', priority: 'ALL', assigneeFilter: 'ALL', department: 'ALL', savedView: 'none' }),
  setActiveFolderId: (activeFolderId) => set({ activeFolderId }),
  toggleFolderCollapsed: (folderId) =>
    set((state) => ({
      collapsedFolderIds: state.collapsedFolderIds.includes(folderId)
        ? state.collapsedFolderIds.filter((id) => id !== folderId)
        : [...state.collapsedFolderIds, folderId],
    })),
  setPageSize: (pageSize) => set({ pageSize }),
}));

export const useTaskWorkspaceViewState = () =>
  useTaskWorkspaceStore(useShallow(
    (state) => ({
      activeView: state.activeView,
      sidebarCollapsed: state.sidebarCollapsed,
      selectedTaskId: state.selectedTaskId,
      search: state.search,
      status: state.status,
      priority: state.priority,
      assigneeFilter: state.assigneeFilter,
      savedView: state.savedView,
      rowSelection: state.rowSelection,
      pageSize: state.pageSize,
    }),
  ));

export const useRowSelection = () =>
  useTaskWorkspaceStore((s) => s.rowSelection);

export const useSelectedTaskIds = () =>
  useTaskWorkspaceStore(
    useShallow((s) => Object.keys(s.rowSelection).filter((id) => s.rowSelection[id]))
  );

export const useTaskSidebarState = () =>
  useTaskWorkspaceStore(
    useShallow((s) => ({
      activeFolderId: s.activeFolderId,
      collapsedFolderIds: s.collapsedFolderIds,
      sidebarCollapsed: s.sidebarCollapsed,
      savedView: s.savedView,
    }))
  );
