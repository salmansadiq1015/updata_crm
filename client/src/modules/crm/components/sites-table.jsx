'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siteService } from '@/modules/crm/services/site-service';
import { customerService, normalizeCustomerList } from '@/modules/crm/services/customer-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { showSuccess, showError } from '@/lib/toast';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { SiteForm } from './site-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatSwissAddress } from '@/lib/formatters';
import { Building2, Eye, ExternalLink, Filter, Search, X, MapPin, Home, Map as MapIcon, List as ListIcon, Plus, UserRound } from 'lucide-react';
import { DotLabel } from '@/shared/components/filter-dot';
import { SitesMap } from '@/modules/crm/components/sites-map';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

const filterTriggerCls = 'rounded-full px-3 py-1.5 text-[12px] font-medium border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all h-8 dark:border-white/10 dark:bg-white/4 dark:text-white/55 dark:hover:bg-white/8 dark:hover:text-white/80';
const activeFilterTriggerCls = 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300';
const filterSelectContentCls = 'border-border bg-popover text-popover-foreground dark:border-white/10 dark:bg-[#0D1117]';
const filterSelectItemCls = 'text-foreground focus:bg-accent focus:text-accent-foreground dark:text-white/80 dark:focus:bg-white/5';

export function SitesTable() {
  const { t } = useLanguage();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cantonFilter, setCantonFilter] = useState('all');
  const [view, setView] = useState('list');

  const debouncedSearch = useDebounce(search, 300);

  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.siteType = typeFilter;
    if (cantonFilter !== 'all') p.canton = cantonFilter;
    return p;
  }, [debouncedSearch, statusFilter, typeFilter, cantonFilter]);

  const {
    items, pageSize, setPageSize, hasNext, hasPrev, isFetching, onNext, onPrev, reset,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.sites.list(merged),
    queryFn: (merged) => siteService.list(merged),
    params: apiParams,
    initialSize: 25,
  });

  const hasActiveFilters =
    !!search || statusFilter !== 'all' || typeFilter !== 'all' || cantonFilter !== 'all';

  const clear = () => {
    setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setCantonFilter('all'); reset();
  };

  const pageStats = useMemo(() => {
    const total = items.length;
    const residential = items.filter((s) => s.siteType === 'residential').length;
    const commercial = items.filter((s) => s.siteType === 'commercial').length;
    const industrial = items.filter((s) => s.siteType === 'industrial').length;
    return { total, residential, commercial, industrial };
  }, [items]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('crm.sites.name', 'Site'),
      size: 280,
      Cell: ({ row }) => {
        const s = row.original;
        const meta = SITE_TYPE_META[s.siteType] || SITE_TYPE_META.residential;
        return (
          <Link href={`/crm/sites/${s._id}`} className="flex items-center gap-3 group min-w-0">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-border shrink-0', meta.bg)}>
              <Building2 className={cn('h-4 w-4', meta.color)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[13px] text-foreground truncate group-hover:text-primary transition-colors">
                  {s.name}
                </span>
                {s.siteNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">{s.siteNumber}</span>
                )}
              </div>
              {s.customerId?.name && (
                <p className="text-xs text-muted-foreground truncate">{s.customerId.name}</p>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'siteType',
      header: t('crm.type', 'Type'),
      size: 140,
      Cell: ({ row }) => {
        const meta = SITE_TYPE_META[row.original.siteType] || SITE_TYPE_META.residential;
        return (
          <span className={cn('inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full', meta.bg, meta.color)}>
            {t(`crm.sites.type.${row.original.siteType}`, meta.label)}
          </span>
        );
      },
    },
    {
      accessorKey: 'address',
      header: t('crm.address', 'Address'),
      size: 300,
      Cell: ({ row }) => {
        const s = row.original;
        const addr = formatSwissAddress({
          street: s.street, postalCode: s.postalCode, city: s.city,
          canton: s.canton ? cantonName(s.canton) : null, country: s.country,
        });
        if (!addr) return <span className="text-[13px] text-muted-foreground/50">—</span>;
        return (
          <span className="text-[13px] text-foreground">
            <MapPin className="inline h-3 w-3 mr-1 text-muted-foreground" />{addr}
          </span>
        );
      },
    },
    {
      accessorKey: 'floorUnit',
      header: t('crm.sites.floorUnit', 'Unit'),
      size: 120,
      Cell: ({ row }) => row.original.floorUnit ? (
        <span className="text-[13px] text-foreground inline-flex items-center gap-1">
          <Home className="h-3 w-3 text-muted-foreground" />{row.original.floorUnit}
        </span>
      ) : <span className="text-[13px] text-muted-foreground/50">—</span>,
    },
    {
      accessorKey: 'status',
      header: t('crm.status', 'Status'),
      size: 120,
      Cell: ({ row }) => {
        const active = row.original.status !== 'inactive';
        return (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full',
            active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
            {active ? t('crm.statusActive', 'Active') : t('crm.sites.statusInactive', 'Inactive')}
          </span>
        );
      },
    },
  ], [t]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
          <MapPin className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold text-foreground leading-tight">
            {t('crm.sites.listTitle', 'Objects')}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {items.length} {t('crm.sites.listDesc', 'objects in portfolio')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NewObjectFlow onCreated={reset} />
          {/* List | Map view toggle */}
          <div className="inline-flex items-center rounded-full border border-border/70 bg-card p-0.5 shadow-theme-sm dark:border-white/10 dark:bg-white/4 dark:shadow-none">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all', view === 'list' ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80')}
            >
              <ListIcon className="h-3.5 w-3.5" /> {t('common.list', 'List')}
            </button>
            <button
              type="button"
              onClick={() => setView('map')}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all', view === 'map' ? 'bg-brand-500/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-muted-foreground hover:text-foreground dark:text-white/50 dark:hover:text-white/80')}
            >
              <MapIcon className="h-3.5 w-3.5" /> {t('common.map', 'Map')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard label={t('crm.stats.total', 'Total')} value={pageStats.total} icon={Building2} accent="violet" />
        <PremiumStatCard label={t('crm.sites.type.residential', 'Residential')} value={pageStats.residential} icon={Home} accent="blue" />
        <PremiumStatCard label={t('crm.sites.type.commercial', 'Commercial')} value={pageStats.commercial} icon={Building2} accent="emerald" />
        <PremiumStatCard label={t('crm.sites.type.industrial', 'Industrial')} value={pageStats.industrial} icon={Building2} accent="amber" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border/60 bg-card px-4 py-3 shadow-theme-sm dark:border-white/6 dark:bg-[#0D1117]">
        <div className="flex items-center gap-1.5 text-muted-foreground dark:text-white/35">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{t('common.filter', 'Filter')}</span>
        </div>
        <div className="w-px h-5 bg-border dark:bg-white/8" />

        <div className="relative flex-1 min-w-50 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground dark:text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('crm.sites.searchPlaceholder', 'Search sites...')}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-input bg-muted/40 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 transition-all dark:border-white/8 dark:bg-white/4 dark:text-white/90 dark:placeholder:text-white/25"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={cn(filterTriggerCls, statusFilter !== 'all' && activeFilterTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.status', 'Status')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className={filterSelectContentCls}>
            <SelectItem value="all" className={filterSelectItemCls}><DotLabel tone="muted">{t('crm.allStatus', 'All statuses')}</DotLabel></SelectItem>
            <SelectItem value="active" className={filterSelectItemCls}><DotLabel tone="emerald">{t('crm.statusActive', 'Active')}</DotLabel></SelectItem>
            <SelectItem value="inactive" className={filterSelectItemCls}><DotLabel tone="slate">{t('crm.sites.statusInactive', 'Inactive')}</DotLabel></SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={cn(filterTriggerCls, typeFilter !== 'all' && activeFilterTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.type', 'Type')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className={filterSelectContentCls}>
            <SelectItem value="all" className={filterSelectItemCls}><DotLabel tone="muted">{t('crm.allTypes', 'All types')}</DotLabel></SelectItem>
            <SelectItem value="residential" className={filterSelectItemCls}><DotLabel tone="blue">{t('crm.sites.type.residential', 'Residential')}</DotLabel></SelectItem>
            <SelectItem value="commercial" className={filterSelectItemCls}><DotLabel tone="emerald">{t('crm.sites.type.commercial', 'Commercial')}</DotLabel></SelectItem>
            <SelectItem value="industrial" className={filterSelectItemCls}><DotLabel tone="amber">{t('crm.sites.type.industrial', 'Industrial')}</DotLabel></SelectItem>
          </SelectContent>
        </Select>

        <Select value={cantonFilter} onValueChange={setCantonFilter}>
          <SelectTrigger className={cn(filterTriggerCls, cantonFilter !== 'all' && activeFilterTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.canton', 'Canton')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className={cn('max-h-72', filterSelectContentCls)}>
            <SelectItem value="all" className={filterSelectItemCls}>{t('crm.allCantons', 'All cantons')}</SelectItem>
            {CH_CANTONS.map((c) => (
              <SelectItem key={c.code} value={c.code} className={filterSelectItemCls}>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground dark:text-white/35">{c.code}</span>{c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-border dark:bg-white/8" />
            <Button variant="ghost" size="sm" className="h-8 text-[12px] text-muted-foreground gap-1 rounded-full hover:text-red-600 hover:bg-red-500/10 dark:text-white/35 dark:hover:text-red-400" onClick={clear}>
              <X className="h-3 w-3" /> {t('common.reset', 'Reset')}
            </Button>
          </>
        )}
      </div>

      {view === 'map' ? (
        <SitesMap sites={items} />
      ) : (
        <DataTableShell
          columns={columns}
          data={items}
          isLoading={isFetching && items.length === 0}
          rowCount={items.length}
          manualPagination
          manualSorting
          manualFiltering
          enableGlobalFilter={false}
          cursorPagination={{
            pageSize, onPageSizeChange: setPageSize, hasNext, hasPrev, isFetching, onNext, onPrev,
          }}
          renderRowActions={({ row }) => {
            const s = row.original;
            const customerId = s.customerId?._id || s.customerId;
            return (
              <RowActionsMenu
                items={[
                  {
                    label: t('common.view', 'View'),
                    icon: Eye,
                    onSelect: () => router.push(`/crm/sites/${s._id}`),
                  },
                  {
                    label: t('crm.openCustomer', 'Open customer'),
                    icon: ExternalLink,
                    hidden: !customerId,
                    onSelect: () => router.push(`/crm/customers/${customerId}`),
                  },
                ]}
              />
            );
          }}
        />
      )}
    </div>
  );
}

// ── New object flow (client feedback #7) ──────────────────────────────────────
// An object belongs to a customer, so from the standalone /crm/sites list we
// first pick the customer, then reuse SiteForm to create the object for it.
function NewObjectFlow({ onCreated }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: customers = [], isFetching } = useQuery({
    queryKey: ['crm', 'customers', 'site-picker', debouncedSearch],
    queryFn: async () => normalizeCustomerList(
      await customerService.getCustomers({ ...(debouncedSearch ? { search: debouncedSearch } : {}), limit: 20 }),
    ),
    enabled: pickerOpen,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (data) => siteService.createForCustomer(customer._id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.sites.all() });
      showSuccess(t('crm.sites.createdToast', 'Objekt erstellt'));
      setFormOpen(false);
      setCustomer(null);
      onCreated?.();
    },
    onError: (err) => showError(err.message),
  });

  const pickCustomer = (c) => {
    setCustomer(c);
    setPickerOpen(false);
    setFormOpen(true);
  };

  return (
    <>
      <Button size="sm" className="h-8 gap-1.5" onClick={() => { setSearch(''); setPickerOpen(true); }}>
        <Plus className="h-3.5 w-3.5" /> {t('crm.sites.newSite', 'Neues Objekt')}
      </Button>

      {/* Step 1 — choose the customer the object is attached to */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('crm.sites.pickCustomerTitle', 'Kunde wählen')}</DialogTitle>
            <DialogDescription>
              {t('crm.sites.pickCustomerDesc', 'Wählen Sie den Kunden, dem das neue Objekt zugeordnet wird.')}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('crm.sites.pickCustomerSearch', 'Kunde suchen...')}
              className="h-9 pl-9"
            />
          </div>
          <div className="mt-1 max-h-72 space-y-1 overflow-y-auto">
            {customers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {isFetching ? t('common.loading', 'Wird geladen...') : t('crm.sites.noCustomer', 'Kein Kunde gefunden')}
              </p>
            ) : (
              customers.map((c) => {
                const isPrivate = (c.customerType || c.type) === 'private';
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => pickCustomer(c)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {isPrivate ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                      {c.customerNumber && <span className="block truncate text-xs text-muted-foreground">{c.customerNumber}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2 — the object form, scoped to the chosen customer */}
      <SiteForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setCustomer(null); }}
        onSubmit={(data) => createMut.mutateAsync(data)}
        isLoading={createMut.isPending}
      />
    </>
  );
}
