'use client';

import { Type } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { TextBlockTable } from '@/modules/catalog/components/text-block-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function TextBlocksPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Type}
        title={t('catalog.textBlocks.title')}
        description={t('catalog.textBlocks.pageDescription')}
      />
      <div className="flex-1 overflow-y-auto">
        <TextBlockTable />
      </div>
    </div>
  );
}
