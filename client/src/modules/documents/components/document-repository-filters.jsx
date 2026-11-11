'use client';

import { memo } from 'react';
import { RefreshCw, Search, X, CalendarRange, ArrowDownWideNarrow, ArrowUpNarrowWide, Tags, Shapes, Layers, Inbox, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { DOCUMENT_ORIGIN_OPTIONS, DOCUMENT_SOURCE_OPTIONS } from '@/modules/documents/utils/document-formatters';
import { humanizeCode } from '@/modules/documents/utils/document-visuals';

function FilterSelect({ value, onChange, options, icon: Icon, ariaLabel, t, active }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-10 min-w-0 rounded-xl', active && 'border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-200')}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>)}
      </SelectContent>
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
  facets,
  onSearchChange,
  onSourceChange,
  onOriginChange,
  onDocumentTypeChange,
  onCategoryChange,
  onDateFromChange,
  onDateToChange,
  onSortOrderChange,
  onRefresh,
  onReset,
  isFetching,
}) {
  const { t } = useLanguage();
  const typeOptions = (facets?.documentTypes || []).map((v) => ({ value: v, label: humanizeCode(v), keywords: v }));
  const categoryOptions = (facets?.categories || []).map((v) => ({ value: v, label: humanizeCode(v), keywords: v }));
  const active = Boolean(search || source !== 'all' || origin !== 'all' || documentType || category || dateFrom || dateTo);

  return (
    <section aria-label={t('documents.repository.filters')} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('documents.repository.searchPlaceholder')}
              aria-label={t('documents.repository.searchPlaceholder')}
              className="h-10 rounded-xl ps-10 pe-9"
            />
            {search ? (
              <button type="button" onClick={() => onSearchChange('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label={t('common.clear', 'Clear')}>
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className={cn('flex h-10 items-center gap-1.5 rounded-xl border px-3', (dateFrom || dateTo) ? 'border-sky-500/40 bg-sky-500/5' : 'border-input bg-background')}>
            <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => onDateFromChange(e.target.value)}
              aria-label={t('documents.repository.dateFrom', 'From')}
              className="w-[8.5rem] bg-transparent text-sm tabular-nums text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
            <span className="text-muted-foreground" aria-hidden="true">–</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => onDateToChange(e.target.value)}
              aria-label={t('documents.repository.dateTo', 'To')}
              className="w-[8.5rem] bg-transparent text-sm tabular-nums text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 rounded-xl"
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            aria-label={sortOrder === 'asc' ? t('documents.repository.oldest', 'Oldest first') : t('documents.repository.newest', 'Newest first')}
          >
            {sortOrder === 'asc' ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}
            <span className="hidden sm:inline">{sortOrder === 'asc' ? t('documents.hub.oldest', 'Oldest') : t('documents.hub.newest', 'Newest')}</span>
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-10 rounded-xl" onClick={onRefresh} disabled={isFetching} aria-label={t('documents.repository.refresh', 'Refresh')} title={t('documents.repository.refresh', 'Refresh')}>
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <FilterSelect value={source} onChange={onSourceChange} options={DOCUMENT_SOURCE_OPTIONS} icon={Layers} ariaLabel={t('documents.repository.source')} t={t} active={source !== 'all'} />
          <FilterSelect value={origin} onChange={onOriginChange} options={DOCUMENT_ORIGIN_OPTIONS} icon={Inbox} ariaLabel={t('documents.repository.origin')} t={t} active={origin !== 'all'} />
          <Combobox
            options={typeOptions}
            value={documentType}
            onChange={(v) => onDocumentTypeChange(v || '')}
            allowClear
            triggerIcon={Shapes}
            placeholder={t('documents.hub.anyType', 'Any type')}
            searchPlaceholder={t('documents.hub.searchTypes', 'Search types…')}
            ariaLabel={t('documents.repository.type')}
            className={cn('h-10 rounded-xl', documentType && 'border-sky-500/40 bg-sky-500/5')}
          />
          <Combobox
            options={categoryOptions}
            value={category}
            onChange={(v) => onCategoryChange(v || '')}
            allowClear
            triggerIcon={Tags}
            placeholder={t('documents.hub.anyCategory', 'Any category')}
            searchPlaceholder={t('documents.hub.searchCategories', 'Search categories…')}
            ariaLabel={t('documents.repository.category')}
            className={cn('h-10 rounded-xl', category && 'border-sky-500/40 bg-sky-500/5')}
          />
          {active ? (
            <Button type="button" variant="ghost" className="h-10 gap-2 rounded-xl text-muted-foreground hover:text-foreground" onClick={onReset}>
              <RotateCcw className="size-4" />{t('documents.hub.resetFilters', 'Reset')}
            </Button>
          ) : <span className="hidden xl:block" />}
        </div>
      </div>
    </section>
  );
});
