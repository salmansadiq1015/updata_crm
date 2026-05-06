'use client';

import { useQuery } from '@tanstack/react-query';
import { taskFolderService } from '../services/task-folder-service';

export const folderQueryKeys = {
  all: (): readonly string[] => ['tasks', 'workspace', 'folders'],
  detail: (id: string): readonly string[] => ['tasks', 'workspace', 'folders', id],
};

export function useFolders() {
  return useQuery({
    queryKey: folderQueryKeys.all(),
    queryFn: () => taskFolderService.list(),
    staleTime: 90_000,
    gcTime: 10 * 60_000,
  });
}

export function useFolderDetail(id: string | null) {
  return useQuery({
    queryKey: folderQueryKeys.detail(id ?? ''),
    queryFn: () => taskFolderService.getById(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
