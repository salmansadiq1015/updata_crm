'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { Search, Filter, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG, ORDER_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';

const STATUS_OPTS = [
  { value: 'all', de: 'Alle Status', en: 'All Statuses' },
  ...Object.entries(ORDER_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
];

const TYPE_OPTS = [
  { value: 'all', de: 'Alle Typen', en: 'All Types' },
  ...Object.entries(ORDER_TYPE_LABELS).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
];

const activeFilterClass = 'border-primary/40 bg-primary/5 text-primary';

export function FieldOpsOrderFilters({ search, onSearch, status, onStatus, type, onType, onClear }) {
  const { locale: lang } = useLanguage();
  const l = (o) => lang === 'de' ? o.de : o.en;
  const hasFilters = search || (status && status !== 'all') || (type && type !== 'all');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
      <Separator orientation="vertical" className="h-5" />
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={lang === 'de' ? 'Aufträge suchen...' : 'Search orders...'}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 w-48 pl-8 text-sm rounded-full border-dashed"
        />
      </div>
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[130px] rounded-full border-dashed text-xs', status !== 'all' && activeFilterClass)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{l(o)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={type} onValueChange={onType}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[140px] rounded-full border-dashed text-xs', type !== 'all' && activeFilterClass)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{l(o)}</SelectItem>)}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 mr-1" />
          {lang === 'de' ? 'Zurücksetzen' : 'Reset'}
        </Button>
      )}
    </div>
  );
}
