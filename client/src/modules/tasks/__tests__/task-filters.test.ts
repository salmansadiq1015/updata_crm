import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { toTaskParams } from '../hooks/use-task-workspace';
import { useTaskWorkspaceStore } from '../state/task-workspace-store';
import type { TaskFilters } from '../types/task-types';

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

describe('toTaskParams', () => {
  it('produces params with default sortBy=sortOrder and sortOrder=asc', () => {
    const params = toTaskParams({}, 50);
    expect(params.sortBy).toBe('sortOrder');
    expect(params.sortOrder).toBe('asc');
    expect(params.limit).toBe(50);
  });

  it('passes status filter through', () => {
    const params = toTaskParams({ status: 'COMPLETED' }, 50);
    expect(params.status).toBe('COMPLETED');
  });

  it('passes priority filter through', () => {
    const params = toTaskParams({ priority: 'HIGH' }, 50);
    expect(params.priority).toBe('HIGH');
  });

  it('passes dueToday: true for dueToday filter', () => {
    const params = toTaskParams({ dueToday: true }, 50);
    expect(params.dueToday).toBe(true);
  });

  it('passes overdue: true for overdue filter', () => {
    const params = toTaskParams({ overdue: true }, 50);
    expect(params.overdue).toBe(true);
  });

  it('respects custom page size', () => {
    const params = toTaskParams({}, 25);
    expect(params.limit).toBe(25);
  });

  it('passes listId filter through', () => {
    const params = toTaskParams({ listId: 'list-abc' }, 50);
    expect(params.listId).toBe('list-abc');
  });

  it('passes assigneeId filter through', () => {
    const params = toTaskParams({ assigneeId: 'user-xyz' }, 50);
    expect(params.assigneeId).toBe('user-xyz');
  });

  it('passes q (search) filter through', () => {
    const params = toTaskParams({ q: 'invoice' }, 50);
    expect(params.q).toBe('invoice');
  });

  it('passes combined filters through', () => {
    const filters: TaskFilters = {
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      listId: 'list-1',
    };
    const params = toTaskParams(filters, 50);
    expect(params.status).toBe('IN_PROGRESS');
    expect(params.priority).toBe('URGENT');
    expect(params.listId).toBe('list-1');
  });

  it('does not include dueToday when not set', () => {
    const params = toTaskParams({ status: 'OPEN' }, 50);
    expect(params.dueToday).toBeUndefined();
  });
});

describe('store-driven filter state', () => {
  it('setStatus updates status correctly', () => {
    act(() => useTaskWorkspaceStore.getState().setStatus('IN_PROGRESS'));
    expect(useTaskWorkspaceStore.getState().status).toBe('IN_PROGRESS');
  });

  it('setPriority updates priority correctly', () => {
    act(() => useTaskWorkspaceStore.getState().setPriority('MEDIUM'));
    expect(useTaskWorkspaceStore.getState().priority).toBe('MEDIUM');
  });

  it('setSavedView dueToday maps to dueToday param', () => {
    act(() => useTaskWorkspaceStore.getState().setSavedView('dueToday'));
    const { savedView } = useTaskWorkspaceStore.getState();
    const filters: TaskFilters = savedView === 'dueToday' ? { dueToday: true } : {};
    const params = toTaskParams(filters, 50);
    expect(params.dueToday).toBe(true);
  });

  it('setSavedView overdue maps to overdue param', () => {
    act(() => useTaskWorkspaceStore.getState().setSavedView('overdue'));
    const { savedView } = useTaskWorkspaceStore.getState();
    const filters: TaskFilters = savedView === 'overdue' ? { overdue: true } : {};
    const params = toTaskParams(filters, 50);
    expect(params.overdue).toBe(true);
  });

  it('clearFilters resets all filters to default', () => {
    act(() => {
      useTaskWorkspaceStore.getState().setSearch('test query');
      useTaskWorkspaceStore.getState().setStatus('COMPLETED');
      useTaskWorkspaceStore.getState().setPriority('URGENT');
      useTaskWorkspaceStore.getState().setSavedView('overdue');
    });

    act(() => useTaskWorkspaceStore.getState().clearFilters());

    const { search, status, priority, savedView } = useTaskWorkspaceStore.getState();
    expect(search).toBe('');
    expect(status).toBe('ALL');
    expect(priority).toBe('ALL');
    expect(savedView).toBe('none');
  });
});
