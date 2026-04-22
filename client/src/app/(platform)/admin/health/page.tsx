'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { HealthDashboard } from '@/modules/platform/components/health-dashboard';

export default function HealthPage() {
  return (
    <PermissionGate permission="system:read" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title="Systemstatus"
          description="Übersicht über den Zustand aller Systemkomponenten"
        />
        <HealthDashboard />
      </div>
    </PermissionGate>
  );
}
