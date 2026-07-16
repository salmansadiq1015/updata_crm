'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DotLabel } from '@/shared/components/filter-dot';
import { useLanguage } from '@/lib/i18n/language-context';
import { Search, Filter, X, User, Building2, Calendar, RefreshCw, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { queryKeys } from '@/lib/query/keys';
import { customerService } from '@/modules/crm/services/customer-service';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Check } from 'lucide-react';

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

/** Minimal user picker backed by the users list endpoint — mirrors project-form.jsx */
function UserPickerFilter({ value, onChange, placeholder, placeholderDe }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100, q: debouncedSearch }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, {
        params: { status: 'active', limit: 100, ...(debouncedSearch ? { search: debouncedSearch } : {}) },
      });
      return res.data;
    },
  });
  const users = Array.isArray(usersData) ? usersData : [];
  const selected = users.find((u) => u._id === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 h-8 rounded-full border border-dashed text-xs px-3 transition-colors',
            'hover:bg-accent/60 bg-background',
            value && activeSelectClass,
          )}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[120px] truncate">
            {selected
              ? `${selected.firstName} ${selected.lastName}`
              : (language === 'de' ? placeholderDe : placeholder)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0 shadow-lg" align="start">
        <div className="px-2 pt-2 pb-1.5 border-b">
          <Input
            placeholder={language === 'de' ? 'Suchen...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          <button
            type="button"
            className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', !value && 'bg-accent/50')}
            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
          >
            <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
              <User className="h-3 w-3 text-muted-foreground/60" />
            </span>
            <span className="text-muted-foreground">{language === 'de' ? 'Alle' : 'All'}</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
          {users.map((u) => (
            <button
              type="button"
              key={u._id}
              className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', u._id === value && 'bg-accent/50')}
              onClick={() => { onChange(u._id); setOpen(false); setSearch(''); }}
            >
              <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center shrink-0">
                {u.firstName?.[0]}{u.lastName?.[0]}
              </span>
              <span className="truncate">{u.firstName} {u.lastName}</span>
              {u._id === value && <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {users.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Keine Nutzer gefunden' : 'No users found'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Minimal customer picker — shows a default list on open, then filters as user types */
function CustomerPickerFilter({ value, onChange }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Default list: first 20 active customers (shown when search is empty)
  const { data: defaultList = [] } = useQuery({
    queryKey: queryKeys.crm.customers.list({ sortBy: 'name', sortOrder: 'asc', limit: 20 }),
    queryFn: async () => {
      const res = await customerService.getCustomers({ sortBy: 'name', sortOrder: 'asc', limit: 20 });
      const items = res?.data || res?.items || (Array.isArray(res) ? res : []);
      return items.filter((c) => c?._id);
    },
    staleTime: 60000,
  });

  // Search results: flexible partial match (shown when user types 1+ chars)
  const { data: searchResults = [] } = useQuery({
    queryKey: queryKeys.crm.customers.search(debouncedSearch),
    queryFn: () => customerService.searchCustomers(debouncedSearch, 20),
    enabled: debouncedSearch.length >= 1,
  });

  const customers = debouncedSearch.length >= 1 ? searchResults : defaultList;

  // When a value is set but not in current list, fetch name via a secondary key
  const { data: selectedCustomerData } = useQuery({
    queryKey: ['customerName', value],
    queryFn: async () => {
      if (!value) return null;
      const res = await apiClient.get(`/crm/customers/${value}`);
      return res.data;
    },
    enabled: !!value,
    staleTime: 60000,
  });

  const displayName = customers.find((c) => c._id === value)?.name
    || selectedCustomerData?.name
    || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 h-8 rounded-full border border-dashed text-xs px-3 transition-colors',
            'hover:bg-accent/60 bg-background',
            value && activeSelectClass,
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-[130px] truncate">
            {displayName ?? (language === 'de' ? 'Kunde' : 'Customer')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 shadow-lg" align="start">
        <div className="px-2 pt-2 pb-1.5 border-b">
          <Input
            placeholder={language === 'de' ? 'Kunden suchen...' : 'Search customers...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          <button
            type="button"
            className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', !value && 'bg-accent/50')}
            onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
          >
            <span className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center shrink-0">
              <Building2 className="h-3 w-3 text-muted-foreground/60" />
            </span>
            <span className="text-muted-foreground">{language === 'de' ? 'Alle' : 'All'}</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
          {customers.map((c) => (
            <button
              type="button"
              key={c._id}
              className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-accent', c._id === value && 'bg-accent/50')}
              onClick={() => { onChange(c._id); setOpen(false); setSearch(''); }}
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <span className="truncate">{c.name}</span>
              {c.customerNumber && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">{c.customerNumber}</span>
              )}
              {c._id === value && <Check className="ml-auto h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {customers.length === 0 && debouncedSearch.length >= 1 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              {language === 'de' ? 'Keine Kunden gefunden' : 'No customers found'}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProjectFilterBar({
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  typeFilter, onTypeFilterChange,
  myOnly, onMyOnlyChange,
  projectManagerId, onProjectManagerIdChange,
  customerId, onCustomerIdChange,
  plannedStartFrom, onPlannedStartFromChange,
  plannedStartTo, onPlannedStartToChange,
  includeDeleted, onIncludeDeletedChange,
  onRefresh,
  onClear,
}) {
  const { language } = useLanguage();
  const lang = (opt) => language === 'de' ? opt.label : opt.labelEn;

  const hasActiveFilters = (statusFilter && statusFilter !== 'all')
    || (typeFilter && typeFilter !== 'all')
    || !!search
    || myOnly
    || !!projectManagerId
    || !!customerId
    || !!plannedStartFrom
    || !!plannedStartTo
    || includeDeleted;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
      <Separator orientation="vertical" className="h-5" />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={language === 'de' ? 'Projekte suchen...' : 'Search projects...'}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-48 pl-8 text-sm rounded-full border-dashed"
        />
      </div>

      {/* Status */}
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

      {/* Type */}
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

      {/* My Projects toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onMyOnlyChange?.(!myOnly)}
        className={cn('h-8 rounded-full border-dashed text-xs gap-1.5', myOnly && activeSelectClass)}
      >
        <User className="h-3.5 w-3.5" />
        {language === 'de' ? 'Meine Projekte' : 'My Projects'}
      </Button>

      {/* Project Manager picker */}
      <UserPickerFilter
        value={projectManagerId}
        onChange={onProjectManagerIdChange}
        placeholder="Project Manager"
        placeholderDe="Projektleiter"
      />

      {/* Customer picker */}
      <CustomerPickerFilter value={customerId} onChange={onCustomerIdChange} />

      {/* Date-range: plannedStartFrom */}
      <div className="flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          type="date"
          value={plannedStartFrom || ''}
          onChange={(e) => onPlannedStartFromChange?.(e.target.value || null)}
          className={cn('h-8 w-36 rounded-full border-dashed text-xs', plannedStartFrom && activeSelectClass)}
          title={language === 'de' ? 'Start ab' : 'Start from'}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={plannedStartTo || ''}
          onChange={(e) => onPlannedStartToChange?.(e.target.value || null)}
          className={cn('h-8 w-36 rounded-full border-dashed text-xs', plannedStartTo && activeSelectClass)}
          title={language === 'de' ? 'Start bis' : 'Start to'}
        />
      </div>

      {/* Include Deleted toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncludeDeletedChange?.(!includeDeleted)}
        className={cn('h-8 rounded-full border-dashed text-xs gap-1.5', includeDeleted && 'border-destructive/40 bg-destructive/5 text-destructive')}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {language === 'de' ? 'Gelöscht zeigen' : 'Show Deleted'}
      </Button>

      {/* Manual refresh */}
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          title={language === 'de' ? 'Aktualisieren' : 'Refresh'}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Clear all filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 mr-1" />
          {language === 'de' ? 'Zurücksetzen' : 'Reset'}
        </Button>
      )}
    </div>
  );
}
