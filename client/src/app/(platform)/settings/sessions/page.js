'use client';

import { Suspense } from 'react';
import { PageHeader } from '@/shared/components/page-header';
import { SessionsTable } from '@/modules/sessions/components/sessions-table';
import { SessionsSkeleton } from '@/shared/components/page-skeletons';
import { useLanguage } from '@/lib/i18n/language-context';

export default function SessionsPage() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('sessions.title')}
        description={t('sessions.titleDesc') || 'Verwalten Sie Ihre angemeldeten Geräte und Sitzungen.'}
      />
      <SessionsTable />
    </div>
  );
}
