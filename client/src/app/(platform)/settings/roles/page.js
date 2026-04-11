import { PageHeader } from '@/components/common/page-header';
import { RolesTable } from '@/components/tables/roles-table';

export const metadata = {
  title: 'Rollen \u2014 MB Boiler ERP',
};

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rollenverwaltung"
        description="Rollen erstellen, Berechtigungen konfigurieren und Zugriff steuern."
      />
      <RolesTable />
    </div>
  );
}
