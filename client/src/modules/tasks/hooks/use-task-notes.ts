'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskNote } from '../types/task-types';
import { taskApi } from '../services/task-api';

export const taskNoteKeys = {
  list: (taskId: string) => ['tasks', taskId, 'notes'] as const,
};

export function useTaskNotes(taskId: string | null | undefined) {
  return useQuery({
    queryKey: taskNoteKeys.list(taskId ?? ''),
    queryFn: () => taskApi.listNotes(taskId!),
    enabled: !!taskId,
    staleTime: 30_000,
  });
}

export function useCreateNote(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bodyHtml: string) => taskApi.createNote(taskId, bodyHtml),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskNoteKeys.list(taskId) });
    },
  });
}

export function useDeleteNote(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => taskApi.deleteNote(taskId, noteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskNoteKeys.list(taskId) });
    },
  });
}
