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
