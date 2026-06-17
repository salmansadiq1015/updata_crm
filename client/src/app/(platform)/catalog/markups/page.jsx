'use client';

import { Percent } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { CatalogMarkupRulesManager } from '@/modules/catalog/components/catalog-markup-rules-manager';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CatalogMarkupsPage() {
  const { t } = useLanguage();
  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        icon={Percent}
        title={t('catalog.markups.title')}
        description={t('catalog.markups.pageDescription')}
      />
      <div className="flex-1 overflow-y-auto">
        <CatalogMarkupRulesManager />
      </div>
    </div>
  );
}
