'use client';

import { useMutation } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '../services/document-service';
import { useNetworkStatus } from './use-network-status';

export function useOrderDocuments(orderId) {
  const isOnline = useNetworkStatus();

  return useQuery({
    queryKey: queryKeys.mobile.documents.byOrder(orderId),
    queryFn: () => documentService.getDocuments(orderId),
    enabled: !!orderId && isOnline,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDocumentDownload() {
  return useMutation({
    mutationFn: ({ orderId, docId }) => documentService.getDownloadUrl(orderId, docId),
  });
}

export function useDocumentUpload(orderId) {
  return useMutation({
    mutationFn: (formData) => documentService.uploadDocument(orderId, formData),
  });
}
