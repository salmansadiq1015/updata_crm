'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FieldOpsReportsTable } from '@/modules/field-ops/components/reports/field-ops-reports-table';

function FieldOpsReportsPageInner() {
  // The assistant links straight to a report; hand the id to the table so it
  // opens it instead of leaving the reader to find it in the list.
  const searchParams = useSearchParams();
  return <FieldOpsReportsTable focusId={searchParams.get('reportId')} />;
}

export default function FieldOpsReportsPage() {
  return (
    <Suspense fallback={null}>
      <FieldOpsReportsPageInner />
    </Suspense>
  );
}
