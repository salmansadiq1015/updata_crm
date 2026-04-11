import { PageHeader } from '@/components/common/page-header';
import { SessionsTable } from '@/components/tables/sessions-table';

export const metadata = { title: 'Sitzungen — MB Boiler ERP' };

export default function SessionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Aktive Sitzungen" description="Verwalten Sie Ihre angemeldeten Geräte und Sitzungen." />
      <SessionsTable />
    </div>
  );
}
