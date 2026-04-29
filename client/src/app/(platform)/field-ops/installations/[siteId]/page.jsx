'use client';
import { use } from 'react';
import { FieldOpsInstallationsTable } from '@/modules/field-ops/components/installations/field-ops-installations-table';
export default function FieldOpsInstallationsPage({ params }) {
  const { siteId } = use(params);
  return (
    <div className="p-6">
      <FieldOpsInstallationsTable siteId={siteId} />
    </div>
  );
}
