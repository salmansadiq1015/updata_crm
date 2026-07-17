'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import {
  useDocumentRepository,
  useDownloadRepositoryDocument,
} from '@/modules/documents/hooks/use-document-repository';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';

/**
 * Read-only documents for an object (site). The object itself has no direct
 * document link — documents reach it through its projects, which the backend
 * resolves when queried with `siteId` (client feedback #18, slice 1).
 */
export function SiteDocumentsTab({ siteId }) {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState(null);
  const { data, isLoading, error } = useDocumentRepository({ siteId, sortOrder: 'desc', limit: 100 });
  const download = useDownloadRepositoryDocument();

  const documents = data?.items || [];

  const openDocument = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      if (payload?.downloadUrl) {
        window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('crm.sites.documentsDesc', 'Alle Dokumente aus den Projekten dieses Objekts.')}
      </p>
      <DocumentRepositoryTable
        documents={documents}
        loading={isLoading}
        error={error}
        onPreview={openDocument}
        onDownload={openDocument}
        busyId={busyId}
      />
    </div>
  );
}
