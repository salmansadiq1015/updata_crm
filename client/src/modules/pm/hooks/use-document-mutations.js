'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '@/modules/pm/services/document-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useDocumentMutations(projectId, { onUpload, onDelete, onGenerate } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.documents.byProject(projectId) });
  };

  const upload = useMutation({
    mutationFn: ({ file, options }) => documentService.uploadDocument(projectId, file, options),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentUploaded', 'Document uploaded')); onUpload?.(res); },
    onError: (err) => showError(err.message),
  });

  const updateMetadata = useMutation({
    mutationFn: ({ docId, data }) => documentService.updateDocumentMetadata(projectId, docId, data),
    onSuccess: () => { invalidate(); showSuccess(t('pm.projectUpdated', 'Updated')); },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (docId) => documentService.deleteDocument(projectId, docId),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentDeleted', 'Document deleted')); onDelete?.(res); },
    onError: (err) => showError(err.message),
  });

  const generate = useMutation({
    mutationFn: (templateType) => documentService.generateDocument(projectId, templateType),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentGenerated', 'Document generated')); onGenerate?.(res); },
    onError: (err) => showError(err.message),
  });

  return { upload, updateMetadata, remove, generate };
}
