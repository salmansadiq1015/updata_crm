'use client';

import { useMemo } from 'react';
import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { taskApi } from '../services/task-api';
import { useTaskWorkspaceStore } from '../state/task-workspace-store';
import type { Task, TaskFilters, TaskListParams, TaskPage, TaskPatch } from '../types/task-types';

export const TASK_PAGE_SIZE = 50;

export const taskWorkspaceKeys = {
  root: ['tasks', 'workspace'] as const,
  lists: () => [...taskWorkspaceKeys.root, 'lists'] as const,
  windows: () => [...taskWorkspaceKeys.root, 'windows'] as const,
  window: (params: Omit<TaskListParams, 'cursor'>) => [...taskWorkspaceKeys.windows(), params] as const,
  detail: (id: string | null) => [...taskWorkspaceKeys.root, 'detail', id] as const,
  folders: () => [...taskWorkspaceKeys.root, 'folders'] as const,
  folderDetail: (id: string) => [...taskWorkspaceKeys.root, 'folders', id] as const,
};

const updateTaskInPages = (
  oldData: InfiniteData<TaskPage> | undefined,
  taskId: string,
  updater: (task: Task) => Task | null,
): InfiniteData<TaskPage> | undefined => {
  if (!oldData) return oldData;
  return {
    ...oldData,
    pages: oldData.pages.map((page) => ({
      ...page,
      data: page.data
        .map((task) => (task.id === taskId ? updater(task) : task))
        .filter((task): task is Task => task !== null),
    })),
  };
};

const insertTaskInFirstPage = (
  oldData: InfiniteData<TaskPage> | undefined,
  task: Task,
): InfiniteData<TaskPage> | undefined => {
  if (!oldData) return oldData;
  const exists = oldData.pages.some((page) => page.data.some((item) => item.id === task.id));
  if (exists) return oldData;

  const [firstPage, ...restPages] = oldData.pages;
  if (!firstPage) return oldData;

  return {
    ...oldData,
    pages: [
      {
        ...firstPage,
        data: [task, ...firstPage.data].slice(0, firstPage.pagination.limit),
      },
      ...restPages,
    ],
  };
};

export function useTaskListsV2() {
  return useQuery({
    queryKey: taskWorkspaceKeys.lists(),
    queryFn: () => taskApi.lists(),
    staleTime: 90_000,
    gcTime: 10 * 60_000,
  });
}

export function useTaskWindow(baseParams: Omit<TaskListParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: taskWorkspaceKeys.window(baseParams),
    queryFn: ({ pageParam }) => taskApi.list({ ...baseParams, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });
}

export function useFlattenedTasks(data: InfiniteData<TaskPage> | undefined): Task[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const tasks: Task[] = [];
    for (const page of data?.pages ?? []) {
      for (const task of page.data) {
        if (!seen.has(task.id)) {
          seen.add(task.id);
          tasks.push(task);
        }
      }
    }
    return tasks;
  }, [data]);
}

export function useTaskDetailV2(id: string | null) {
  return useQuery({
    queryKey: taskWorkspaceKeys.detail(id),
    queryFn: () => taskApi.detail(id ?? ''),
    enabled: Boolean(id),
    staleTime: 20_000,
    gcTime: 10 * 60_000,
  });
}

const applyPatchToTask = (task: Task, patch: TaskPatch): Task => {
  const { expectedVersion, departmentId, ...taskPatch } = patch;
  void expectedVersion;

  return {
    ...task,
    ...taskPatch,
    ...(departmentId !== undefined
      ? { departmentId: departmentId ? { id: departmentId, _id: departmentId } : null }
      : {}),
    version: task.version + 1,
    updatedAt: new Date().toISOString(),
  };
};

export function useTaskWorkspaceMutations(activeParams: Omit<TaskListParams, 'cursor'>) {
  const queryClient = useQueryClient();
  const setSelectedTaskId = useTaskWorkspaceStore((state) => state.setSelectedTaskId);

  const patchTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => taskApi.patch(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: taskWorkspaceKeys.windows() });
      const previousWindows = queryClient.getQueriesData<InfiniteData<TaskPage>>({
        queryKey: taskWorkspaceKeys.windows(),
      });
      const previousDetail = queryClient.getQueryData<Task>(taskWorkspaceKeys.detail(id));

      queryClient.setQueriesData<InfiniteData<TaskPage>>(
        { queryKey: taskWorkspaceKeys.windows() },
        (oldData) => updateTaskInPages(oldData, id, (task) => applyPatchToTask(task, patch)),
      );
      if (previousDetail) {
        queryClient.setQueryData(taskWorkspaceKeys.detail(id), applyPatchToTask(previousDetail, patch));
      }

      return { previousWindows, previousDetail };
    },
    onError: (error, variables, context) => {
      for (const [key, value] of context?.previousWindows ?? []) queryClient.setQueryData(key, value);
      if (context?.previousDetail) {
        queryClient.setQueryData(taskWorkspaceKeys.detail(variables.id), context.previousDetail);
      }
      const message = error instanceof Error ? error.message : 'Task update failed';
      toast.error(message);
    },
    onSuccess: (task) => {
      queryClient.setQueriesData<InfiniteData<TaskPage>>(
        { queryKey: taskWorkspaceKeys.windows() },
        (oldData) => updateTaskInPages(oldData, task.id, () => task),
      );
      queryClient.setQueryData(taskWorkspaceKeys.detail(task.id), task);
    },
  });

  const setLock = useMutation({
    mutationFn: ({ id, locked, expectedVersion }: { id: string; locked: boolean; expectedVersion?: number }) =>
      taskApi.setLock(id, locked, expectedVersion),
    onMutate: async ({ id, locked }) => {
      await queryClient.cancelQueries({ queryKey: taskWorkspaceKeys.windows() });
      const previousWindows = queryClient.getQueriesData<InfiniteData<TaskPage>>({
        queryKey: taskWorkspaceKeys.windows(),
      });
      const previousDetail = queryClient.getQueryData<Task>(taskWorkspaceKeys.detail(id));
      const applyLock = (task: Task): Task => ({ ...task, locked, version: task.version + 1 });

      queryClient.setQueriesData<InfiniteData<TaskPage>>(
        { queryKey: taskWorkspaceKeys.windows() },
        (oldData) => updateTaskInPages(oldData, id, applyLock),
      );
      if (previousDetail) {
        queryClient.setQueryData(taskWorkspaceKeys.detail(id), applyLock(previousDetail));
      }
      return { previousWindows, previousDetail };
    },
    onError: (error, variables, context) => {
      for (const [key, value] of context?.previousWindows ?? []) queryClient.setQueryData(key, value);
      if (context?.previousDetail) {
        queryClient.setQueryData(taskWorkspaceKeys.detail(variables.id), context.previousDetail);
      }
      const message = error instanceof Error ? error.message : 'Lock update failed';
      toast.error(message);
    },
    onSuccess: (task) => {
      queryClient.setQueriesData<InfiniteData<TaskPage>>(
        { queryKey: taskWorkspaceKeys.windows() },
        (oldData) => updateTaskInPages(oldData, task.id, () => task),
      );
      queryClient.setQueryData(taskWorkspaceKeys.detail(task.id), task);
    },
  });

  const createTask = useMutation({
    // Accepts a bare title (command bar, list row) or { title, status } for
    // the board's per-column quick add, where the column decides the status.
    mutationFn: (input: string | { title: string; status?: Task['status'] }) => {
      const { title, status: statusOverride } = typeof input === 'string' ? { title: input, status: undefined } : input;
      const params: Pick<Task, 'title'> & Partial<TaskPatch> = { title };
      if (activeParams.listId) params.listId = activeParams.listId;
      if (activeParams.priority) params.priority = activeParams.priority;
      if (statusOverride) params.status = statusOverride;
      else if (activeParams.status) params.status = activeParams.status;
      return taskApi.create(params);
    },
    onSuccess: (task) => {
      const matchesActiveWindow =
        (!activeParams.listId || task.listId === activeParams.listId) &&
        (!activeParams.status || task.status === activeParams.status) &&
        (!activeParams.priority || task.priority === activeParams.priority);
      if (matchesActiveWindow) {
        queryClient.setQueryData<InfiniteData<TaskPage>>(
          taskWorkspaceKeys.window(activeParams),
          (oldData) => insertTaskInFirstPage(oldData, task),
        );
      }
      queryClient.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
      setSelectedTaskId(task.id);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Task creation failed';
      toast.error(message);
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => taskApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: taskWorkspaceKeys.windows() });
      const previousWindows = queryClient.getQueriesData<InfiniteData<TaskPage>>({
        queryKey: taskWorkspaceKeys.windows(),
      });
      queryClient.setQueriesData<InfiniteData<TaskPage>>(
        { queryKey: taskWorkspaceKeys.windows() },
        (oldData) => updateTaskInPages(oldData, id, () => null),
      );
      return { previousWindows };
    },
    onError: (error, _id, context) => {
      for (const [key, value] of context?.previousWindows ?? []) queryClient.setQueryData(key, value);
      const message = error instanceof Error ? error.message : 'Task deletion failed';
      toast.error(message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskWorkspaceKeys.lists() });
    },
  });

  const duplicateTask = useMutation({
    mutationFn: async (id: string) => {
      const cached = queryClient.getQueryData<Task>(taskWorkspaceKeys.detail(id));
      const source = cached ?? await taskApi.detail(id);
      return taskApi.create({
        title: `Copy of ${source.title}`,
        ...(source.description ? { description: source.description } : {}),
        status: 'OPEN' as const,
        priority: source.priority,
        ...(source.listId ? { listId: source.listId } : {}),
        ...(source.dueDate ? { dueDate: source.dueDate } : {}),
        ...(source.assigneeId ? { assigneeId: source.assigneeId } : {}),
      });
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: taskWorkspaceKeys.root });
      setSelectedTaskId(task.id);
      toast.success('Task duplicated');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Task duplication failed';
      toast.error(message);
    },
  });

  return { patchTask, setLock, createTask, deleteTask, duplicateTask };
}

export function toTaskParams(filters: TaskFilters, pageSize = TASK_PAGE_SIZE): Omit<TaskListParams, 'cursor'> {
  return {
    ...filters,
    status: filters.status,
    priority: filters.priority,
    limit: pageSize,
    sortBy: 'sortOrder',
    sortOrder: 'asc',
  };
}
