// client/src/modules/crm/hooks/use-customer-attachments.js
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachmentService } from '@/modules/crm/services/attachment-service';
import { showSuccess, showError } from '@/lib/toast';

const qKey = (customerId) => ['crm', 'attachments', customerId];

export function useCustomerAttachments(customerId) {
  return useQuery({
    queryKey: qKey(customerId),
    queryFn: () => attachmentService.list(customerId),
    enabled: !!customerId,
    select: (data) => (Array.isArray(data) ? data : []),
  });
}

export function useAttachmentMutations(customerId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qKey(customerId) });

  const upload = useMutation({
    mutationFn: (file) => attachmentService.upload(customerId, file),
    onSuccess: () => { invalidate(); showSuccess('File uploaded'); },
    onError: (err) => showError(err),
  });

  const rename = useMutation({
    mutationFn: ({ fileId, originalName }) =>
      attachmentService.rename(customerId, fileId, originalName),
    onSuccess: () => { invalidate(); showSuccess('File renamed'); },
    onError: (err) => showError(err),
  });

  const remove = useMutation({
    mutationFn: (fileId) => attachmentService.remove(customerId, fileId),
    onSuccess: () => { invalidate(); showSuccess('File deleted'); },
    onError: (err) => showError(err),
  });

  const bulkRemove = useMutation({
    mutationFn: (fileIds) => attachmentService.bulkRemove(customerId, fileIds),
    onSuccess: (data) => {
      invalidate();
      const n = data?.deleted ?? 0;
      if (n === 0) showError('No files were deleted');
      else showSuccess(`${n} file(s) deleted`);
    },
    onError: (err) => showError(err),
  });

  const download = useMutation({
    mutationFn: (fileId) => attachmentService.getDownloadUrl(fileId),
    onSuccess: (url) => { if (url) window.open(url, '_blank'); },
    onError: (err) => showError(err),
  });

  return { upload, rename, remove, bulkRemove, download };
}
