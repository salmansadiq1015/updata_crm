'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DotLabel } from '@/shared/components/filter-dot';
import { useLanguage } from '@/lib/i18n/language-context';
import { Search, Filter, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Alle Status', labelEn: 'All Statuses', tone: 'muted' },
  { value: 'DRAFT', label: 'Entwurf', labelEn: 'Draft', tone: 'slate' },
  { value: 'PLANNING', label: 'Planung', labelEn: 'Planning', tone: 'blue' },
  { value: 'IN_PROGRESS', label: 'In Arbeit', labelEn: 'In Progress', tone: 'amber' },
  { value: 'ON_HOLD', label: 'Pausiert', labelEn: 'On Hold', tone: 'orange' },
  { value: 'COMPLETED', label: 'Abgeschlossen', labelEn: 'Completed', tone: 'emerald' },
  { value: 'ARCHIVED', label: 'Archiviert', labelEn: 'Archived', tone: 'slate' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Alle Typen', labelEn: 'All Types', tone: 'muted' },
  { value: 'NEW_INSTALLATION', label: 'Neuinstallation', labelEn: 'New Installation', tone: 'blue' },
  { value: 'RENOVATION', label: 'Sanierung', labelEn: 'Renovation', tone: 'amber' },
  { value: 'MAINTENANCE', label: 'Wartung', labelEn: 'Maintenance', tone: 'emerald' },
  { value: 'SERVICE_CONTRACT', label: 'Servicevertrag', labelEn: 'Service Contract', tone: 'violet' },
  { value: 'OTHER', label: 'Sonstiges', labelEn: 'Other', tone: 'slate' },
];

const activeSelectClass = 'border-primary/40 bg-primary/5 text-primary';

export function ProjectFilterBar({
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  typeFilter, onTypeFilterChange,
  onClear,
}) {
  const { language } = useLanguage();
  const lang = (opt) => language === 'de' ? opt.label : opt.labelEn;

  const hasActiveFilters = (statusFilter && statusFilter !== 'all')
    || (typeFilter && typeFilter !== 'all')
    || !!search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
      <Separator orientation="vertical" className="h-5" />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={language === 'de' ? 'Projekte suchen...' : 'Search projects...'}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-48 pl-8 text-sm rounded-full border-dashed"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[130px] rounded-full border-dashed text-xs', statusFilter !== 'all' && activeSelectClass)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <DotLabel tone={opt.tone}>{lang(opt)}</DotLabel>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[150px] rounded-full border-dashed text-xs', typeFilter !== 'all' && activeSelectClass)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <DotLabel tone={opt.tone}>{lang(opt)}</DotLabel>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 mr-1" />
          {language === 'de' ? 'Zuruecksetzen' : 'Reset'}
        </Button>
      )}
    </div>
  );
}
