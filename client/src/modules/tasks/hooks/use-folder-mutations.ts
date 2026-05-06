'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { taskFolderService } from '../services/task-folder-service';
import { folderQueryKeys } from './use-folder-queries';

export function useFolderMutations() {
  const queryClient = useQueryClient();

  const invalidateFolders = () =>
    queryClient.invalidateQueries({ queryKey: folderQueryKeys.all() });

  const createFolder = useMutation({
    mutationFn: (data: { name: string; color?: string | null; icon?: string | null }) =>
      taskFolderService.create(data),
    onSuccess: (folder) => {
      queryClient.setQueryData(folderQueryKeys.all(), (old: any) => {
        if (!old) return { folders: [folder], unfoldered: [] };
        return { ...old, folders: [...(old.folders ?? []), folder] };
      });
      toast.success('Folder created');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      toast.error(message);
    },
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      taskFolderService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: folderQueryKeys.all() });
      const previous = queryClient.getQueryData(folderQueryKeys.all());
      queryClient.setQueryData(folderQueryKeys.all(), (old: any) => {
        if (!old?.folders) return old;
        return {
          ...old,
          folders: old.folders.map((f: any) => (f.id === id ? { ...f, ...patch } : f)),
        };
      });
      return { previous };
    },
    onError: (error, _variables, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(folderQueryKeys.all(), ctx.previous);
      const message = error instanceof Error ? error.message : 'Failed to update folder';
      toast.error(message);
    },
    onSuccess: (folder) => {
      queryClient.setQueryData(folderQueryKeys.all(), (old: any) => {
        if (!old?.folders) return old;
        return {
          ...old,
          folders: old.folders.map((f: any) => (f.id === folder.id ? folder : f)),
        };
      });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => taskFolderService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: folderQueryKeys.all() });
      const previous = queryClient.getQueryData(folderQueryKeys.all());
      queryClient.setQueryData(folderQueryKeys.all(), (old: any) => {
        if (!old?.folders) return old;
        return { ...old, folders: old.folders.filter((f: any) => f.id !== id) };
      });
      return { previous };
    },
    onError: (error, _id, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(folderQueryKeys.all(), ctx.previous);
      const message = error instanceof Error ? error.message : 'Failed to delete folder';
      toast.error(message);
    },
    onSuccess: () => {
      invalidateFolders();
    },
  });

  const reorderFolders = useMutation({
    mutationFn: (orderedIds: string[]) => taskFolderService.reorder(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: folderQueryKeys.all() });
      const previous = queryClient.getQueryData(folderQueryKeys.all());
      queryClient.setQueryData(folderQueryKeys.all(), (old: any) => {
        if (!old?.folders) return old;
        const map = new Map(old.folders.map((f: any) => [f.id, f]));
        const reordered = orderedIds
          .map((id, i) => {
            const f = map.get(id);
            return f ? { ...f, sortOrder: i } : null;
          })
          .filter(Boolean);
        return { ...old, folders: reordered };
      });
      return { previous };
    },
    onError: (error, _orderedIds, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(folderQueryKeys.all(), ctx.previous);
      const message = error instanceof Error ? error.message : 'Failed to reorder folders';
      toast.error(message);
    },
  });

  return { createFolder, updateFolder, deleteFolder, reorderFolders };
}
