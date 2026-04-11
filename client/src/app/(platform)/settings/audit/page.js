import { PageHeader } from '@/components/common/page-header';
import { AuditLogTable } from '@/components/tables/audit-log-table';

export const metadata = { title: 'Audit Log — MB Boiler ERP' };

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Protokoll aller sicherheitsrelevanten Aktivitaeten im System." />
      <AuditLogTable />
    </div>
  );
}
