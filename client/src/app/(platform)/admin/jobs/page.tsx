'use client';

import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { JobsViewer } from '@/modules/platform/components/jobs-viewer';

export default function JobsPage() {
  return (
    <PermissionGate permission="system:admin" permissions={[]}>
      <div className="space-y-6">
        <PageHeader
          title="Hintergrundjobs"
          description="Übersicht über geplante und laufende Hintergrundjobs"
        />
        <JobsViewer />
      </div>
    </PermissionGate>
  );
}
