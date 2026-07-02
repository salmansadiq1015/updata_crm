'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { MigrationDashboard } from '@/modules/migration/components/migration-dashboard';
import { useLanguage } from '@/lib/i18n/language-context';
import { DatabaseZap } from 'lucide-react';

export default function MigrationPage() {
  const { t } = useLanguage();

  return (
    <PermissionGate permission="settings:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title={t('migration.page.title')}
          description={t('migration.page.description')}
          icon={DatabaseZap}
        />
        <MigrationDashboard />
      </div>
    </PermissionGate>
  );
}
