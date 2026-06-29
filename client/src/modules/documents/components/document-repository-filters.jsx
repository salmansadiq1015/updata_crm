'use client';

import { memo } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  DOCUMENT_ORIGIN_OPTIONS,
  DOCUMENT_SOURCE_OPTIONS,
} from '@/modules/documents/utils/document-formatters';
import { cn } from '@/lib/utils';

const FILTER_CONTROL_CLASS = 'min-w-0';

function TextFilter({ value, onChange, placeholder, ariaLabel, type = 'text', className }) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder}
      className={className}
    />
  );
}

function RepositorySelect({ value, onChange, children, ariaLabel }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export const DocumentRepositoryFilters = memo(function DocumentRepositoryFilters({
  search,
  source,
  origin,
  documentType,
  category,
  dateFrom,
  dateTo,
  sortOrder,
  onSearchChange,
  onSourceChange,
  onOriginChange,
  onDocumentTypeChange,
  onCategoryChange,
  onDateFromChange,
  onDateToChange,
  onSortOrderChange,
  onRefresh,
  isFetching,
}) {
  const { t } = useLanguage();

  return (
    <section
      aria-label={t('documents.repository.filters')}
      className="rounded-lg border bg-background p-3 shadow-sm sm:p-4"
    >
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 2xl:grid-cols-12">
        <div className="relative min-w-0 sm:col-span-2 lg:col-span-3 2xl:col-span-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <TextFilter
            value={search}
            onChange={onSearchChange}
            placeholder={t('documents.repository.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <div className={cn(FILTER_CONTROL_CLASS, 'lg:col-span-3 2xl:col-span-2')}>
          <RepositorySelect
            value={source}
            onChange={onSourceChange}
            ariaLabel={t('documents.repository.source')}
          >
            {DOCUMENT_SOURCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
            ))}
          </RepositorySelect>
        </div>

        <div className={cn(FILTER_CONTROL_CLASS, 'lg:col-span-2 2xl:col-span-2')}>
          <RepositorySelect
            value={origin}
            onChange={onOriginChange}
            ariaLabel={t('documents.repository.origin')}
          >
            {DOCUMENT_ORIGIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
            ))}
          </RepositorySelect>
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <TextFilter
            value={documentType}
            onChange={onDocumentTypeChange}
            placeholder={t('documents.repository.type')}
          />
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <TextFilter
            value={category}
            onChange={onCategoryChange}
            placeholder={t('documents.repository.category')}
          />
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <TextFilter
            type="date"
            value={dateFrom}
            onChange={onDateFromChange}
            ariaLabel={t('documents.repository.dateFrom')}
          />
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <TextFilter
            type="date"
            value={dateTo}
            onChange={onDateToChange}
            ariaLabel={t('documents.repository.dateTo')}
          />
        </div>

        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <RepositorySelect
            value={sortOrder}
            onChange={onSortOrderChange}
            ariaLabel={t('documents.repository.sortOrder')}
          >
            <SelectItem value="desc">{t('documents.repository.newest')}</SelectItem>
            <SelectItem value="asc">{t('documents.repository.oldest')}</SelectItem>
          </RepositorySelect>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 lg:col-span-2 2xl:col-span-1"
          onClick={onRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          {t('common.refresh')}
        </Button>
      </div>
    </section>
  );
});
