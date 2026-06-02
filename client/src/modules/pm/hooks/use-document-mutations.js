'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '@/modules/pm/services/document-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useDocumentMutations(projectId, {
  onUpload, onDelete, onGenerate, onDraft, onEmail,
} = {}) {
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

  // Accepts either a bare templateType string (back-compat) or
  // { templateType, overrides, draftId }.
  const generate = useMutation({
    mutationFn: (input) => documentService.generateDocument(
      projectId,
      typeof input === 'string' ? { templateType: input } : input,
    ),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentGenerated', 'Document generated')); onGenerate?.(res); },
    onError: (err) => showError(err.message),
  });

  const saveDraft = useMutation({
    mutationFn: (input) => documentService.saveDraft(projectId, input),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.draftSaved', 'Draft saved')); onDraft?.(res); },
    onError: (err) => showError(err.message),
  });

  const emailDocument = useMutation({
    mutationFn: ({ docId, to, message }) => documentService.emailDocument(projectId, docId, { to, message }),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentEmailed', 'Document emailed')); onEmail?.(res); },
    onError: (err) => showError(err.message),
  });

  return { upload, updateMetadata, remove, generate, saveDraft, emailDocument };
}
