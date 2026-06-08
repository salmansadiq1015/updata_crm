'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { IntegrationsDashboard } from '@/modules/integrations/components/integrations-dashboard';

export default function IntegrationsPage() {
  return (
    <PermissionGate permission="integrations:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title="Integrationen"
          description="Provider, Credentials, Health Checks und Synchronisationen überwachen"
        />
        <IntegrationsDashboard />
      </div>
    </PermissionGate>
  );
}
