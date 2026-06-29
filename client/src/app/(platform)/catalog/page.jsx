'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { CatalogCategoryTree } from '@/modules/catalog/components/catalog-category-tree';
import { CatalogArticlesTable } from '@/modules/catalog/components/catalog-articles-table';
import { CatalogFilterPanel } from '@/modules/catalog/components/catalog-filter-panel';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CatalogPage() {
  const { t } = useLanguage();
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [filters, setFilters] = useState({});

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="shrink-0 border-b border-border/70 pb-5">
        <PageHeader
          icon={Boxes}
          title={t('catalog.page.title')}
          description={t('catalog.page.description')}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="grid min-h-0 gap-5 md:grid-cols-2 xl:grid-cols-1 xl:grid-rows-[minmax(16rem,1fr)_minmax(16rem,0.9fr)]">
          <section className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm ring-1 ring-foreground/[0.03]">
            <CatalogCategoryTree
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          </section>

          <section className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm ring-1 ring-foreground/[0.03]">
            <CatalogFilterPanel
              filters={{ ...filters, categoryId: selectedCategoryId || undefined }}
              onFiltersChange={setFilters}
            />
          </section>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm ring-1 ring-foreground/[0.03]">
          <CatalogArticlesTable filters={{ ...filters, categoryId: selectedCategoryId || undefined }} />
        </section>
      </div>
    </div>
  );
}
