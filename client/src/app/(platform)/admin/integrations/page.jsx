'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { IntegrationsDashboard } from '@/modules/integrations/components/integrations-dashboard';

export default function IntegrationsPage() {
  const { t } = useLanguage();

  return (
    <PermissionGate permission="integrations:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title={t('integrations.admin.title')}
          description={t('integrations.admin.description')}
        />
        <IntegrationsDashboard />
      </div>
    </PermissionGate>
  );
}
