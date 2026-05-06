import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useTaskWorkspaceStore,
  useSelectedTaskIds,
  useTaskSidebarState,
} from '../state/task-workspace-store';

// Reset the store state before each test to avoid cross-test pollution
beforeEach(() => {
  useTaskWorkspaceStore.setState({
    activeView: 'list',
    sidebarCollapsed: false,
    selectedTaskId: null,
    search: '',
    status: 'ALL',
    priority: 'ALL',
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
  });
});

describe('useTaskWorkspaceStore', () => {
  describe('setSearch', () => {
    it('updates search string', () => {
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.search));
      act(() => useTaskWorkspaceStore.getState().setSearch('hello'));
      expect(result.current).toBe('hello');
    });
  });

  describe('setStatus', () => {
    it('updates status and resets savedView to none', () => {
      // First set a savedView
      act(() => useTaskWorkspaceStore.getState().setSavedView('dueToday'));
      const { result } = renderHook(() =>
        useTaskWorkspaceStore((s) => ({ status: s.status, savedView: s.savedView }))
      );
      act(() => useTaskWorkspaceStore.getState().setStatus('OPEN'));
      expect(result.current.status).toBe('OPEN');
      expect(result.current.savedView).toBe('none');
    });
  });

  describe('setPriority', () => {
    it('updates priority and resets savedView to none', () => {
      act(() => useTaskWorkspaceStore.getState().setSavedView('overdue'));
      const { result } = renderHook(() =>
        useTaskWorkspaceStore((s) => ({ priority: s.priority, savedView: s.savedView }))
      );
      act(() => useTaskWorkspaceStore.getState().setPriority('HIGH'));
      expect(result.current.priority).toBe('HIGH');
      expect(result.current.savedView).toBe('none');
    });
  });

  describe('setSavedView', () => {
    it('sets savedView to dueToday', () => {
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.savedView));
      act(() => useTaskWorkspaceStore.getState().setSavedView('dueToday'));
      expect(result.current).toBe('dueToday');
    });

    it('sets savedView to overdue', () => {
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.savedView));
      act(() => useTaskWorkspaceStore.getState().setSavedView('overdue'));
      expect(result.current).toBe('overdue');
    });
  });

  describe('clearFilters', () => {
    it('resets search, status, priority, and savedView to defaults', () => {
      // Set non-default values
      act(() => {
        useTaskWorkspaceStore.getState().setSearch('find me');
        useTaskWorkspaceStore.getState().setStatus('IN_PROGRESS');
        useTaskWorkspaceStore.getState().setPriority('HIGH');
        useTaskWorkspaceStore.getState().setSavedView('dueToday');
      });

      const { result } = renderHook(() =>
        useTaskWorkspaceStore((s) => ({
          search: s.search,
          status: s.status,
          priority: s.priority,
          savedView: s.savedView,
        }))
      );

      act(() => useTaskWorkspaceStore.getState().clearFilters());

      expect(result.current.search).toBe('');
      expect(result.current.status).toBe('ALL');
      expect(result.current.priority).toBe('ALL');
      expect(result.current.savedView).toBe('none');
    });
  });

  describe('setPageSize', () => {
    it('updates pageSize', () => {
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.pageSize));
      act(() => useTaskWorkspaceStore.getState().setPageSize(100));
      expect(result.current).toBe(100);
    });
  });

  describe('toggleFolderCollapsed', () => {
    it('adds a folderId to collapsedFolderIds when not already present', () => {
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.collapsedFolderIds));
      act(() => useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-1'));
      expect(result.current).toContain('folder-1');
    });

    it('removes a folderId from collapsedFolderIds when already present', () => {
      act(() => useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-1'));
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.collapsedFolderIds));
      act(() => useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-1'));
      expect(result.current).not.toContain('folder-1');
    });

    it('can collapse multiple folders independently', () => {
      act(() => {
        useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-a');
        useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-b');
      });
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.collapsedFolderIds));
      expect(result.current).toContain('folder-a');
      expect(result.current).toContain('folder-b');
    });
  });

  describe('setRowSelection', () => {
    it('updates rowSelection map', () => {
      const selection = { 'task-1': true, 'task-2': true, 'task-3': false };
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.rowSelection));
      act(() => useTaskWorkspaceStore.getState().setRowSelection(selection));
      expect(result.current).toEqual(selection);
    });

    it('replaces the entire selection on each call', () => {
      act(() => useTaskWorkspaceStore.getState().setRowSelection({ 'task-1': true }));
      act(() => useTaskWorkspaceStore.getState().setRowSelection({ 'task-2': true }));
      const { result } = renderHook(() => useTaskWorkspaceStore((s) => s.rowSelection));
      expect(result.current).toEqual({ 'task-2': true });
      expect(result.current['task-1']).toBeUndefined();
    });
  });
});

describe('useSelectedTaskIds selector', () => {
  it('returns empty array when no tasks are selected', () => {
    const { result } = renderHook(() => useSelectedTaskIds());
    expect(result.current).toEqual([]);
  });

  it('returns only ids where value is true', () => {
    act(() =>
      useTaskWorkspaceStore
        .getState()
        .setRowSelection({ 'task-1': true, 'task-2': false, 'task-3': true })
    );
    const { result } = renderHook(() => useSelectedTaskIds());
    expect(result.current).toContain('task-1');
    expect(result.current).toContain('task-3');
    expect(result.current).not.toContain('task-2');
    expect(result.current).toHaveLength(2);
  });
});

describe('useTaskSidebarState selector', () => {
  it('returns activeFolderId, collapsedFolderIds, sidebarCollapsed, and savedView', () => {
    act(() => {
      useTaskWorkspaceStore.getState().setActiveFolderId('folder-x');
      useTaskWorkspaceStore.getState().toggleFolderCollapsed('folder-y');
      useTaskWorkspaceStore.getState().setSidebarCollapsed(true);
      useTaskWorkspaceStore.getState().setSavedView('overdue');
    });

    const { result } = renderHook(() => useTaskSidebarState());
    expect(result.current.activeFolderId).toBe('folder-x');
    expect(result.current.collapsedFolderIds).toContain('folder-y');
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(result.current.savedView).toBe('overdue');
  });
});
