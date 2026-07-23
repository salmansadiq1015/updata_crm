'use client';

import { PageHeader } from '@/shared/components/page-header';
import { AuditLogTable } from '@/modules/audit/components/audit-log-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function AuditLogPage() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('audit.title')}
        description={t('audit.titleDesc') || 'Protokoll aller sicherheitsrelevanten Aktivitäten im System.'}
      />
      <AuditLogTable />
    </div>
  );
}
