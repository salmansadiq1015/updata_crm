'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '@/modules/pm/services/document-service';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useDocumentMutations(projectId, {
  onUpload, onDelete, onRestore, onGenerate, onDraft, onEmail,
} = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    // Invalidate on the [pm, documents, projectId] prefix, not byProject(projectId):
    // that helper pads missing category/filters as undefined/null positional elements,
    // which never prefix-match the live query key (…, category, filters) → no refetch.
    queryClient.invalidateQueries({ queryKey: ['pm', 'documents', projectId] });
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
  const restore = useMutation({
    mutationFn: (docId) => documentService.restoreDocument(projectId, docId),
    onSuccess: (res) => { invalidate(); showSuccess(t('pm.documentRestored', 'Document restored')); onRestore?.(res); },
    onError: (err) => showError(err.message),
  });

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

  const setVisum = useMutation({
    mutationFn: ({ docId, visiert = true }) => documentService.setVisum(projectId, docId, visiert),
    onSuccess: (_, v) => {
      invalidate();
      showSuccess(v.visiert === false ? t('documents.visumRemoved', 'Visum entfernt') : t('documents.visumSet', 'Dokument visiert'));
    },
    onError: (err) => showError(err.message),
  });

  const setReleased = useMutation({
    mutationFn: ({ docId, released = true }) => documentService.setReleased(projectId, docId, released),
    onSuccess: (_, v) => {
      invalidate();
      showSuccess(v.released === false
        ? t('pm.documents.releaseRevoked', 'Freigabe zurückgezogen')
        : t('pm.documents.released', 'Für Aussendienst freigegeben'));
    },
    onError: (err) => showError(err.message),
  });

  const setArchived = useMutation({
    mutationFn: ({ docId, archived = true }) => documentService.setArchived(projectId, docId, archived),
    onSuccess: (_, v) => {
      invalidate();
      showSuccess(v.archived === false ? t('documents.restoredFromArchive', 'Aus Archiv wiederhergestellt') : t('documents.archived', 'Ins Archiv verschoben'));
    },
    onError: (err) => showError(err.message),
  });

  return { upload, updateMetadata, remove, restore, generate, saveDraft, emailDocument, setVisum, setArchived, setReleased };
}
