'use client';

import { Ruler } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { UomManagementTable } from '@/modules/catalog/components/uom-management-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function UnitsPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Ruler}
        title={t('catalog.units.title')}
        description="Configure measurement units used across the catalog"
      />
      <div className="flex-1 overflow-y-auto">
        <UomManagementTable />
      </div>
    </div>
  );
}
