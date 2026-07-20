'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { CleanupWorkspace } from '@/modules/crm/components/cleanup-workspace';
import { useLanguage } from '@/lib/i18n/language-context';
import { Eraser } from 'lucide-react';

export default function CleanupPage() {
  const { t } = useLanguage();

  return (
    <PermissionGate permission="crm:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title={t('cleanup.page.title', 'Datenbereinigung')}
          description={t('cleanup.page.description', 'Kundendaten vor der Migration prüfen und bereinigen.')}
          icon={Eraser}
        />
        <CleanupWorkspace />
      </div>
    </PermissionGate>
  );
}
