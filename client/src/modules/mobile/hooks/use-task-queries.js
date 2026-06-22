'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { mobileTaskService } from '../services/task-service';
import { useOfflineQuery } from './use-offline-query';
import { useNetworkStatus } from './use-network-status';
import { getPendingSyncCount, getFailedSyncCount } from '../db/mobile-db';
import { useSyncStore } from '../stores/sync-store';

async function refreshSyncCounts() {
  const pending = await getPendingSyncCount();
  const failed = await getFailedSyncCount();
  useSyncStore.getState().setCounts(pending, failed);
}

export function useMobileTasks(filters = {}) {
  return useOfflineQuery({
    queryKey: queryKeys.mobile.tasks.list(filters),
    queryFn: () => mobileTaskService.listTasks(filters),
    offlineFn: () => mobileTaskService.listLocalTasks(filters),
    staleTime: 60 * 1000,
  });
}

export function useMobileTaskMutations(filters = {}) {
  const queryClient = useQueryClient();
  const isOnline = useNetworkStatus();
  const listKey = queryKeys.mobile.tasks.list(filters);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mobile', 'tasks'] });
    await refreshSyncCounts();
  };

  const createTask = useMutation({
    mutationFn: (data) =>
      isOnline
        ? mobileTaskService.createTask(data)
        : mobileTaskService.createLocalTask(data),
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }) =>
      isOnline
        ? mobileTaskService.updateTask(id, patch)
        : mobileTaskService.updateLocalTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData(listKey);
      queryClient.setQueryData(listKey, (old) => patchTaskInPage(old, id, patch));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
    },
    onSettled: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: (id) =>
      isOnline
        ? mobileTaskService.deleteTask(id)
        : mobileTaskService.deleteLocalTask(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData(listKey);
      queryClient.setQueryData(listKey, (old) => removeTaskFromPage(old, id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
    },
    onSettled: invalidate,
  });

  return { createTask, updateTask, deleteTask, isOnline };
}

function patchTaskInPage(page, id, patch) {
  if (!page?.data) return page;
  const now = new Date().toISOString();
  return {
    ...page,
    data: page.data.map((task) =>
      task.id === id
        ? { ...task, ...patch, updatedAt: now, version: (task.version || 0) + 1 }
        : task,
    ),
  };
}

function removeTaskFromPage(page, id) {
  if (!page?.data) return page;
  return {
    ...page,
    data: page.data.filter((task) => task.id !== id),
  };
}
