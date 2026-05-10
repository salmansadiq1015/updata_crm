'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { IghConfigForm } from '@/modules/catalog/components/igh-config-form';
import { IghImportHistoryTable } from '@/modules/catalog/components/igh-import-history-table';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/lib/i18n/language-context';

export default function IghPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-8">
      <PageHeader
        icon={RefreshCw}
        title={t('catalog.igh.title')}
        description="Configure and run IGH industry catalog synchronization"
      />
      <div className="max-w-lg">
        <IghConfigForm />
      </div>
      <Separator />
      <div>
        <p className="text-sm font-medium mb-4">{t('catalog.igh.importHistory')}</p>
        <IghImportHistoryTable />
      </div>
    </div>
  );
}
