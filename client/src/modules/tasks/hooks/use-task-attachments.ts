'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskAttachment } from '../types/task-types';
import { taskApi } from '../services/task-api';

export const attachmentKeys = {
  list: (taskId: string) => ['tasks', taskId, 'attachments'] as const,
};

export function useTaskAttachments(taskId: string | null | undefined) {
  return useQuery({
    queryKey: attachmentKeys.list(taskId ?? ''),
    queryFn: () => taskApi.listAttachments(taskId!),
    enabled: !!taskId,
    staleTime: 60_000,
  });
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => taskApi.uploadAttachment(taskId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentKeys.list(taskId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    },
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => taskApi.deleteAttachment(taskId, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attachmentKeys.list(taskId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    },
  });
}
