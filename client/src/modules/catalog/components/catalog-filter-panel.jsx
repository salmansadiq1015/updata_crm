'use client';

import { useArticleFacets } from '../hooks/use-catalog-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function CatalogFilterPanel({ filters, onFiltersChange }) {
  const { t } = useLanguage();
  const { data: facets } = useArticleFacets({ categoryId: filters.categoryId, q: filters.q });

  const toggle = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: filters[key] === value ? undefined : value,
    });
  };

  const hasActiveFilters = !!(filters.type || filters.status || filters.source
    || filters.supplierName
    || filters.manufacturerName || filters.productGroup || filters.availabilityStatus
    || filters.priceMin || filters.priceMax);

  const reset = () => onFiltersChange({
    ...filters,
    type: undefined,
    status: undefined,
    source: undefined,
    supplierName: undefined,
    manufacturerName: undefined,
    productGroup: undefined,
    availabilityStatus: undefined,
    priceMin: undefined,
    priceMax: undefined,
  });

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-card/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('catalog.filter.title', 'Filters')}
          </p>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-2 rounded-lg px-2 text-xs" onClick={reset}>
            <X className="h-3.5 w-3.5" />
            {t('catalog.filter.reset')}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <FacetGroup
          label={t('catalog.filter.type')}
          items={facets?.types ?? []}
          active={filters.type}
          onToggle={(value) => toggle('type', value)}
        />

        <FacetGroup
          label={t('catalog.filter.status')}
          items={facets?.statuses ?? []}
          active={filters.status}
          onToggle={(value) => toggle('status', value)}
        />

        <FacetGroup
          label={t('catalog.filter.source')}
          items={facets?.sources ?? []}
          active={filters.source}
          onToggle={(value) => toggle('source', value)}
        />

        <FacetGroup
          label={t('catalog.filter.availability') || 'Availability'}
          items={facets?.availabilityStatuses ?? []}
          active={filters.availabilityStatus}
          onToggle={(value) => toggle('availabilityStatus', value)}
        />

        <FacetGroup
          label={t('catalog.filter.supplier') || 'Supplier'}
          items={facets?.suppliers ?? []}
          active={filters.supplierName}
          onToggle={(value) => toggle('supplierName', value)}
        />

        <FacetGroup
          label={t('catalog.filter.manufacturer') || 'Manufacturer'}
          items={facets?.manufacturers ?? []}
          active={filters.manufacturerName}
          onToggle={(value) => toggle('manufacturerName', value)}
        />

        <FacetGroup
          label={t('catalog.filter.productGroup') || 'Product group'}
          items={facets?.productGroups ?? []}
          active={filters.productGroup}
          onToggle={(value) => toggle('productGroup', value)}
        />

        {facets?.priceRange && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('catalog.filter.priceRange')}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label className="text-xs">{t('catalog.filter.priceMin')}</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={String(facets.priceRange.min)}
                  value={filters.priceMin ?? ''}
                  onChange={(event) => onFiltersChange({
                    ...filters,
                    priceMin: event.target.value !== '' ? Number(event.target.value) : undefined,
                  })}
                  className="h-9 rounded-lg text-xs"
                />
              </div>
              <span className="pt-4 text-muted-foreground">-</span>
              <div className="flex-1">
                <Label className="text-xs">{t('catalog.filter.priceMax')}</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={String(facets.priceRange.max)}
                  value={filters.priceMax ?? ''}
                  onChange={(event) => onFiltersChange({
                    ...filters,
                    priceMax: event.target.value !== '' ? Number(event.target.value) : undefined,
                  })}
                  className="h-9 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FacetGroup({ label, items = [], active, onToggle }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((f) => (
          <Badge
            key={f.value}
            role="button"
            tabIndex={0}
            variant={active === f.value ? 'default' : 'outline'}
            className="max-w-full cursor-pointer select-none truncate rounded-lg"
            onClick={() => onToggle(f.value)}
            onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onToggle(f.value)}
          >
            <span className="truncate">{f.value}</span>
            <span className="ml-1 opacity-60">{f.count}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
