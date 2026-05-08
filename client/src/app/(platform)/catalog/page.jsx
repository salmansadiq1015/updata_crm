'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { CatalogCategoryTree } from '@/modules/catalog/components/catalog-category-tree';
import { CatalogArticlesTable } from '@/modules/catalog/components/catalog-articles-table';
import { CatalogFilterPanel } from '@/modules/catalog/components/catalog-filter-panel';
import { useLanguage } from '@/lib/i18n/language-context';

export default function CatalogPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [filters, setFilters] = useState({});

  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Boxes}
        title={de ? 'Materialkatalog' : 'Material Catalog'}
        description={de
          ? 'Artikel, Dienstleistungen und Kategorien verwalten'
          : 'Manage articles, services and categories'}
      />

      <div className="flex flex-1 gap-5 min-h-0 overflow-hidden">
        {/* Category tree sidebar */}
        <div className="w-56 shrink-0 rounded-xl border bg-card overflow-hidden">
          <CatalogCategoryTree
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
        </div>

        {/* Faceted filter panel */}
        <div className="w-48 shrink-0 rounded-xl border bg-card overflow-y-auto">
          <CatalogFilterPanel
            filters={{ ...filters, categoryId: selectedCategoryId || undefined }}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Articles table */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <CatalogArticlesTable filters={{ ...filters, categoryId: selectedCategoryId || undefined }} />
        </div>
      </div>
    </div>
  );
}
