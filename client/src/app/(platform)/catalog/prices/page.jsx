'use client';

import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { PriceManagementTable } from '@/modules/catalog/components/price-management-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function PricesPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={TrendingUp}
        title={t('catalog.prices.title')}
        description="Bulk updates, price history, scheduled changes, and rollback"
      />
      <div className="flex-1 overflow-y-auto">
        <PriceManagementTable />
      </div>
    </div>
  );
}
