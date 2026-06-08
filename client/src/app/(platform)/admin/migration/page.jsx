'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { MigrationDashboard } from '@/modules/migration/components/migration-dashboard';

export default function MigrationPage() {
  return (
    <PermissionGate permission="settings:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title="Datenmigration"
          description="Migrationen aus OF, Messerli und weiteren Quellen verwalten, prüfen und freigeben"
        />
        <MigrationDashboard />
      </div>
    </PermissionGate>
  );
}
