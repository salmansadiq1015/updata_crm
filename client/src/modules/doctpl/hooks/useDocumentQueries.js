import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '../services/DocumentService';

export const useDocuments = (f = {}) => useQuery({
  queryKey: queryKeys.doctpl.documents.list(f),
  queryFn: () => documentService.list(f),
  select: (r) => ({ items: r?.data ?? [], pagination: r?.pagination }),
});

export const useDocumentDetail = (id) => useQuery({
  queryKey: queryKeys.doctpl.documents.detail(id),
  queryFn: () => documentService.getById(id),
  enabled: !!id,
  select: (r) => r?.data,
});

export const useDocumentsBySource = (mod, rid) => useQuery({
  queryKey: queryKeys.doctpl.documents.bySource(mod, rid),
  queryFn: () => documentService.bySource(mod, rid),
  enabled: !!(mod && rid),
  select: (r) => r?.data ?? [],
});

export const useDocumentBatchStatus = (batchId, enabled = true) => useQuery({
  queryKey: ['doctpl', 'documents', 'batch', batchId],
  queryFn: () => documentService.batchStatus(batchId),
  enabled: !!batchId && enabled,
  refetchInterval: (query) => {
    const status = query.state.data?.data?.status;
    return ['COMPLETED', 'PARTIAL_FAILED', 'FAILED'].includes(status) ? false : 2500;
  },
  select: (r) => r?.data,
});
