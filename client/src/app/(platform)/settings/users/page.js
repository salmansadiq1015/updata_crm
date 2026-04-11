import { PageHeader } from '@/components/common/page-header';
import { UsersTable } from '@/components/tables/users-table';

export const metadata = {
  title: 'Benutzer — MB Boiler ERP',
};

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Benutzerverwaltung"
        description="Mitarbeiter anlegen, bearbeiten, Rollen zuweisen und Zugriff verwalten."
      />
      <UsersTable />
    </div>
  );
}
