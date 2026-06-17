'use client';

import { PlugZap } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { CatalogConnectionsManager } from '@/modules/catalog/components/catalog-connections-manager';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CatalogConnectionsPage() {
  const { t } = useLanguage();
  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        icon={PlugZap}
        title={t('catalog.connections.title')}
        description={t('catalog.connections.pageDescription')}
      />
      <div className="flex-1 overflow-y-auto">
        <CatalogConnectionsManager />
      </div>
    </div>
  );
}
