import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentRepositoryService } from '../services/document-repository-service';

export function useDocumentRepository(filters = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(filters),
    queryFn: () => documentRepositoryService.list(filters),
    staleTime: 20_000,
  });
}

export function useUploadRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: documentRepositoryService.upload,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
  });
}

export function useDownloadRepositoryDocument() {
  return useMutation({
    mutationFn: (id) => documentRepositoryService.getDownloadUrl(id),
  });
}

export function useDownloadRepositoryDocumentAttachment() {
  return useMutation({
    mutationFn: (id) => documentRepositoryService.getDownloadUrl(id, { attachment: true }),
  });
}

export function useDeleteRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => documentRepositoryService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
  });
}

export function useArchiveRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }) => documentRepositoryService.setArchived(id, archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
  });
}
