'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { taskFolderService } from '../services/task-folder-service';
import { folderQueryKeys } from './use-folder-queries';
import type { TaskFolderCreate, TaskFolderPatch, TaskFolderWithLists } from '../types/task-types';

type FolderQueryData = Awaited<ReturnType<typeof taskFolderService.list>>;
type FolderMutationContext = {
  previous?: FolderQueryData;
};

const isFolder = (folder: TaskFolderWithLists | null): folder is TaskFolderWithLists => folder !== null;

export function useFolderMutations() {
  const queryClient = useQueryClient();

  const invalidateFolders = () =>
    queryClient.invalidateQueries({ queryKey: folderQueryKeys.all() });

  const createFolder = useMutation({
    mutationFn: (data: TaskFolderCreate) => taskFolderService.create(data),
    onSuccess: (folder) => {
      queryClient.setQueryData<FolderQueryData>(folderQueryKeys.all(), (old) => {
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
    mutationFn: ({ id, patch }: { id: string; patch: TaskFolderPatch }) =>
      taskFolderService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: folderQueryKeys.all() });
      const previous = queryClient.getQueryData<FolderQueryData>(folderQueryKeys.all());
      queryClient.setQueryData<FolderQueryData>(folderQueryKeys.all(), (old) => {
        if (!old?.folders) return old;
        return {
          ...old,
          folders: old.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        };
      });
      return { previous };
    },
    onError: (error, _variables, ctx?: FolderMutationContext) => {
      if (ctx?.previous) queryClient.setQueryData(folderQueryKeys.all(), ctx.previous);
      const message = error instanceof Error ? error.message : 'Failed to update folder';
      toast.error(message);
    },
    onSuccess: (folder) => {
      queryClient.setQueryData<FolderQueryData>(folderQueryKeys.all(), (old) => {
        if (!old?.folders) return old;
        return {
          ...old,
          folders: old.folders.map((f) => (f.id === folder.id ? folder : f)),
        };
      });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => taskFolderService.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: folderQueryKeys.all() });
      const previous = queryClient.getQueryData<FolderQueryData>(folderQueryKeys.all());
      queryClient.setQueryData<FolderQueryData>(folderQueryKeys.all(), (old) => {
        if (!old?.folders) return old;
        return { ...old, folders: old.folders.filter((f) => f.id !== id) };
      });
      return { previous };
    },
    onError: (error, _id, ctx?: FolderMutationContext) => {
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
      const previous = queryClient.getQueryData<FolderQueryData>(folderQueryKeys.all());
      queryClient.setQueryData<FolderQueryData>(folderQueryKeys.all(), (old) => {
        if (!old?.folders) return old;
        const map = new Map(old.folders.map((f) => [f.id, f]));
        const reordered = orderedIds
          .map((id, i) => {
            const f = map.get(id);
            return f ? { ...f, sortOrder: i } : null;
          })
          .filter(isFolder);
        return { ...old, folders: reordered };
      });
      return { previous };
    },
    onError: (error, _orderedIds, ctx?: FolderMutationContext) => {
      if (ctx?.previous) queryClient.setQueryData(folderQueryKeys.all(), ctx.previous);
      const message = error instanceof Error ? error.message : 'Failed to reorder folders';
      toast.error(message);
    },
  });

  return { createFolder, updateFolder, deleteFolder, reorderFolders };
}
