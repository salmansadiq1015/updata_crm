'use client';

import { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';
import {
  useArchiveRepositoryDocument,
  useVisumRepositoryDocument,
  useReleaseRepositoryDocument,
  useDocumentRepository,
  useDownloadRepositoryDocument,
  useDownloadRepositoryDocumentAttachment,
} from '@/modules/documents/hooks/use-document-repository';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';
import { DOCUMENT_SECTIONS, documentSectionOf } from '@/modules/pm/constants/pm-constants';
import { cn } from '@/lib/utils';

/**
 * Read-only documents for an object (site). The object itself has no direct
 * document link — documents reach it through its projects, which the backend
 * resolves when queried with `siteId` (client feedback #18, slice 1).
 *
 * Split into the same three sections as the project documents tab
 * (Dokumente / Dokumente mit Visum / Archiv), read-only here.
 */
export function SiteDocumentsTab({ siteId }) {
  const { t, language } = useLanguage();
  const [busyId, setBusyId] = useState(null);
  const [activeSection, setActiveSection] = useState('documents');
  const { data, isLoading, error } = useDocumentRepository({ siteId, sortOrder: 'desc', limit: 100 });
  const download = useDownloadRepositoryDocument();
  const downloadAttachment = useDownloadRepositoryDocumentAttachment();
  const archiveMutation = useArchiveRepositoryDocument();
  const visumMutation = useVisumRepositoryDocument();
  const releaseMutation = useReleaseRepositoryDocument();

  const documents = data?.items || [];

  const sectionCounts = useMemo(() => {
    const counts = { documents: 0, visum: 0, archiv: 0 };
    for (const d of documents) counts[documentSectionOf(d)] += 1;
    return counts;
  }, [documents]);

  const sectionDocs = useMemo(
    () => documents.filter((d) => documentSectionOf(d) === activeSection),
    [documents, activeSection],
  );

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

  const handleDownload = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await downloadAttachment.mutateAsync(doc.id);
      if (payload?.downloadUrl) {
        await downloadFromUrl(payload.downloadUrl, payload.fileName || doc.fileName);
      } else {
        showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleVisum = async (doc) => {
    setBusyId(doc.id);
    try {
      const next = !doc.visumBy;
      await visumMutation.mutateAsync({ id: doc.id, visiert: next });
      showSuccess(t(next ? 'documents.repository.visumSetDone' : 'documents.repository.visumRemovedDone'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleRelease = async (doc) => {
    setBusyId(doc.id);
    try {
      const next = !doc.releasedToField;
      await releaseMutation.mutateAsync({ id: doc.id, released: next });
      showSuccess(t(next ? 'documents.repository.releasedDone' : 'documents.repository.releaseRevokedDone'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (doc) => {
    setBusyId(doc.id);
    try {
      const newArchived = !doc.archived;
      await archiveMutation.mutateAsync({ id: doc.id, archived: newArchived });
      showSuccess(t(newArchived ? 'documents.repository.archived' : 'documents.repository.unarchived'));
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

      {/* Section tabs — same colored navigation as the project documents tab */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {DOCUMENT_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active ? section.activeCls : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <SectionIcon className="h-3.5 w-3.5" />
              {language === 'de' ? section.label : section.labelEn}
              <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? section.badgeCls : 'bg-muted text-muted-foreground')}>
                {sectionCounts[section.id]}
              </span>
            </button>
          );
        })}
      </div>

      <DocumentRepositoryTable
        documents={sectionDocs}
        loading={isLoading}
        error={error}
        onPreview={openDocument}
        onDownload={handleDownload}
        onArchive={handleArchive}
        onVisum={handleVisum}
        onRelease={handleRelease}
        busyId={busyId}
      />
    </div>
  );
}
