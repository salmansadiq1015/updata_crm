'use client';

import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { accDocService } from '@/modules/accounting/services/accounting-service';
import { generateId } from '@/lib/utils/ids';
import { db } from '../db/mobile-db';
import { ACCOUNTING_DOCUMENT_TYPE, PHOTO_CONFIG, SYNC_ENTITY_TYPE, SYNC_STATUS } from '../constants/mobile-constants';
import { compressPhoto } from '../lib/photo-utils';
import { useOfflineMutation } from './use-offline-mutation';

const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']);

function buildMetadata({ documentType, notes, projectReference }) {
  return {
    documentType,
    notes: notes?.trim() || '',
    projectReference: projectReference?.trim() || '',
  };
}

async function prepareFile(file, messages) {
  if (!file) throw new Error(messages.noFileSelected);
  if (!ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error(messages.unsupportedFileType);
  }
  if (file.size > PHOTO_CONFIG.MAX_FILE_SIZE) {
    throw new Error(messages.fileTooLarge);
  }

  if (file.type.startsWith('image/')) {
    const compressed = await compressPhoto(file);
    return {
      blob: compressed,
      fileName: `${file.name.replace(/\.[^.]+$/, '') || 'scan'}.jpg`,
      mimeType: 'image/jpeg',
    };
  }

  return {
    blob: file,
    fileName: file.name || 'document.pdf',
    mimeType: file.type,
  };
}

export function useAccountingDocumentScan() {
  const { t } = useLanguage();
  const messages = {
    noFileSelected: t('mobile.accountingScan.noFileSelected', 'No file selected'),
    unsupportedFileType: t('mobile.accountingScan.unsupportedFileType', 'Unsupported file type'),
    fileTooLarge: t('mobile.accountingScan.fileTooLarge', 'File exceeds 20 MB'),
  };

  return useOfflineMutation({
    mutationFn: async ({ file, documentType = ACCOUNTING_DOCUMENT_TYPE.RECEIPT, notes, projectReference }) => {
      const prepared = await prepareFile(file, messages);
      return accDocService.upload(
        new File([prepared.blob], prepared.fileName, { type: prepared.mimeType }),
        buildMetadata({ documentType, notes, projectReference })
      );
    },
    entityType: SYNC_ENTITY_TYPE.ACCOUNTING_DOCUMENT,
    invalidateKeys: [['accounting', 'documents']],
    onOfflineWrite: async ({ file, documentType = ACCOUNTING_DOCUMENT_TYPE.RECEIPT, notes, projectReference }) => {
      const prepared = await prepareFile(file, messages);
      const id = generateId();
      const now = new Date().toISOString();
      const metadata = buildMetadata({ documentType, notes, projectReference });

      await db.accountingDocuments.add({
        id,
        document_type: documentType,
        file_blob: prepared.blob,
        file_name: prepared.fileName,
        mime_type: prepared.mimeType,
        file_size_bytes: prepared.blob.size,
        notes: metadata.notes,
        project_reference: metadata.projectReference,
        sync_status: SYNC_STATUS.PENDING_SYNC,
        created_at: now,
      });

      return {
        entityId: id,
        operation: 'CREATE',
        payload: { metadata },
      };
    },
    onSuccess: () => toast.success(t('mobile.accountingScan.documentSaved', 'Document saved')),
    onError: (err) => toast.error(err?.message || t('common.tryAgain', 'Please try again.')),
  });
}
