'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskPatch, TaskPriority } from '../types/task-types';
import { taskApi } from '../services/task-api';

export const subtaskKeys = {
  list: (parentId: string) => ['tasks', parentId, 'subtasks'] as const,
};

export function useTaskSubtasks(parentId: string | null | undefined) {
  return useQuery({
    queryKey: subtaskKeys.list(parentId ?? ''),
    queryFn: () => taskApi.listSubtasks(parentId!),
    enabled: !!parentId,
    staleTime: 30_000,
  });
}

export function useCreateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, title, priority }: { parentId: string; title: string; priority?: TaskPriority }) =>
      taskApi.createSubtask(parentId, { title, priority }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: subtaskKeys.list(variables.parentId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', variables.parentId] });
    },
  });
}

export function usePatchSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => taskApi.patch(id, patch),
    onSuccess: (updatedTask) => {
      if (updatedTask.parentTaskId) {
        qc.invalidateQueries({ queryKey: subtaskKeys.list(updatedTask.parentTaskId) });
      }
    },
  });
}
