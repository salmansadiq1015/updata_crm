import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentRepositoryService } from '../services/document-repository-service';

export function useDocumentRepository(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.documents.list(filters),
    queryFn: () => documentRepositoryService.list(filters),
    staleTime: 20_000,
    // Keep the current page on screen while the next one loads — no skeleton flash.
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useDocumentStats(options = {}) {
  return useQuery({ queryKey: queryKeys.documents.stats(), queryFn: documentRepositoryService.stats, staleTime: 30_000, ...options });
}

export function useDocumentFacets(options = {}) {
  return useQuery({ queryKey: queryKeys.documents.facets(), queryFn: documentRepositoryService.facets, staleTime: 5 * 60_000, ...options });
}

export function useDocumentLinkTargets(type, search, options = {}) {
  return useQuery({
    queryKey: queryKeys.documents.linkTargets(type, search),
    queryFn: () => documentRepositoryService.linkTargets(type, search),
    enabled: Boolean(type),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useUpdateRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }) => documentRepositoryService.update(id, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
  });
}

export function useBulkRepositoryDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids }) => documentRepositoryService.bulk(action, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
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

export function useVisumRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visiert }) => documentRepositoryService.setVisum(id, visiert),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() }),
  });
}

export function useReleaseRepositoryDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, released }) => documentRepositoryService.setReleased(id, released),
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

/**
 * Documents that can be attached to an email — merged from the repository,
 * generated documents and project documents, since a stored file lives in
 * whichever of the three indexed it.
 */
export function useAttachableDocuments(filters = {}, options = {}) {
  return useQuery({
    queryKey: ['documents', 'attachable', filters],
    queryFn: () => documentRepositoryService.listAttachable(filters),
    staleTime: 20_000,
    ...options,
  });
}
