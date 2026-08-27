'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { DocumentIngestionAdmin } from '@/modules/documents/components/document-ingestion-admin';

export default function DocumentIngestionPage() {
  const { t } = useLanguage();

  return (
    <PermissionGate permission="integrations:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title={t('documents.ingestion.title', 'Dokumenteneingang')}
          description={t('documents.ingestion.subtitle', 'Postfach und Scan-Ordner, aus denen Dokumente automatisch eingelesen und einem Projekt zugeordnet werden.')}
        />
        <DocumentIngestionAdmin />
      </div>
    </PermissionGate>
  );
}
