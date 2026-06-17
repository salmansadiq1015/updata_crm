'use client';

import { useArticleFacets } from '../hooks/use-catalog-queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
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
    <div className="space-y-4 p-4 text-sm">
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={reset}>
          <X className="w-3 h-3" />
          {t('catalog.filter.reset')}
        </Button>
      )}

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.type')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.types ?? []).map((f) => (
            <Badge
              key={f.value}
              role="button"
              tabIndex={0}
              variant={filters.type === f.value ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => toggle('type', f.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('type', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.status')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.statuses ?? []).map((f) => (
            <Badge
              key={f.value}
              role="button"
              tabIndex={0}
              variant={filters.status === f.value ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => toggle('status', f.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('status', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
          {t('catalog.filter.source')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(facets?.sources ?? []).map((f) => (
            <Badge
              key={f.value}
              role="button"
              tabIndex={0}
              variant={filters.source === f.value ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => toggle('source', f.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle('source', f.value)}
            >
              {f.value} <span className="ml-1 opacity-60">{f.count}</span>
            </Badge>
          ))}
        </div>
      </div>

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
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
            {t('catalog.filter.priceRange')}
          </p>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Label className="text-xs">{t('catalog.filter.priceMin')}</Label>
              <Input
                type="number"
                min={0}
                placeholder={String(facets.priceRange.min)}
                value={filters.priceMin ?? ''}
                onChange={(e) => onFiltersChange({ ...filters, priceMin: e.target.value !== '' ? Number(e.target.value) : undefined })}
                className="h-8 text-xs"
              />
            </div>
            <span className="pt-4 text-muted-foreground">–</span>
            <div className="flex-1">
              <Label className="text-xs">{t('catalog.filter.priceMax')}</Label>
              <Input
                type="number"
                min={0}
                placeholder={String(facets.priceRange.max)}
                value={filters.priceMax ?? ''}
                onChange={(e) => onFiltersChange({ ...filters, priceMax: e.target.value !== '' ? Number(e.target.value) : undefined })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FacetGroup({ label, items = [], active, onToggle }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((f) => (
          <Badge
            key={f.value}
            role="button"
            tabIndex={0}
            variant={active === f.value ? 'default' : 'outline'}
            className="max-w-full cursor-pointer select-none truncate"
            onClick={() => onToggle(f.value)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle(f.value)}
          >
            <span className="truncate">{f.value}</span>
            <span className="ml-1 opacity-60">{f.count}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
