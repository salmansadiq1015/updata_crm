'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { siteService } from '@/modules/crm/services/site-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatSwissAddress } from '@/lib/formatters';
import { Building2, Eye, ExternalLink, Filter, Search, X, MapPin, Home } from 'lucide-react';
import { DotLabel } from '@/shared/components/filter-dot';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

const baseTriggerCls = 'rounded-full px-3 py-1.5 text-[12px] font-medium border border-white/10 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/80 transition-all h-8';
const activeTriggerCls = 'border-violet-500/30 bg-violet-500/15 text-violet-300';

export function SitesTable() {
  const { t } = useLanguage();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cantonFilter, setCantonFilter] = useState('all');

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
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-white/8 shrink-0', meta.bg)}>
              <Building2 className={cn('h-4 w-4', meta.color)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[13px] text-white/80 truncate group-hover:text-white/90 transition-colors">
                  {s.name}
                </span>
                {s.siteNumber && (
                  <span className="text-[10px] font-mono text-white/35 shrink-0">{s.siteNumber}</span>
                )}
              </div>
              {s.customerId?.name && (
                <p className="text-xs text-white/40 truncate">{s.customerId.name}</p>
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
        if (!addr) return <span className="text-[13px] text-white/25">—</span>;
        return (
          <span className="text-[13px] text-white/80">
            <MapPin className="inline h-3 w-3 mr-1 text-white/35" />{addr}
          </span>
        );
      },
    },
    {
      accessorKey: 'floorUnit',
      header: t('crm.sites.floorUnit', 'Unit'),
      size: 120,
      Cell: ({ row }) => row.original.floorUnit ? (
        <span className="text-[13px] text-white/80 inline-flex items-center gap-1">
          <Home className="h-3 w-3 text-white/35" />{row.original.floorUnit}
        </span>
      ) : <span className="text-[13px] text-white/25">—</span>,
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
            active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/40',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-white/20')} />
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
          <h1 className="text-[18px] font-semibold text-white/90 leading-tight">
            {t('crm.sites.listTitle', 'Objects')}
          </h1>
          <p className="text-[13px] text-white/40 mt-0.5">
            {items.length} {t('crm.sites.listDesc', 'objects in portfolio')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard label={t('crm.stats.total', 'Total')} value={pageStats.total} icon={Building2} accent="violet" />
        <PremiumStatCard label={t('crm.sites.type.residential', 'Residential')} value={pageStats.residential} icon={Home} accent="blue" />
        <PremiumStatCard label={t('crm.sites.type.commercial', 'Commercial')} value={pageStats.commercial} icon={Building2} accent="emerald" />
        <PremiumStatCard label={t('crm.sites.type.industrial', 'Industrial')} value={pageStats.industrial} icon={Building2} accent="amber" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-white/6 bg-[#0D1117] px-4 py-3">
        <div className="flex items-center gap-1.5 text-white/35">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{t('common.filter', 'Filter')}</span>
        </div>
        <div className="w-px h-5 bg-white/8" />

        <div className="relative flex-1 min-w-50 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('crm.sites.searchPlaceholder', 'Search sites...')}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-white/8 bg-white/4 text-[13px] text-white/90 placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={cn(baseTriggerCls, statusFilter !== 'all' && activeTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.status', 'Status')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="bg-[#0D1117] border-white/10">
            <SelectItem value="all" className="text-white/80 focus:bg-white/5"><DotLabel tone="muted">{t('crm.allStatus', 'All statuses')}</DotLabel></SelectItem>
            <SelectItem value="active" className="text-white/80 focus:bg-white/5"><DotLabel tone="emerald">{t('crm.statusActive', 'Active')}</DotLabel></SelectItem>
            <SelectItem value="inactive" className="text-white/80 focus:bg-white/5"><DotLabel tone="slate">{t('crm.sites.statusInactive', 'Inactive')}</DotLabel></SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={cn(baseTriggerCls, typeFilter !== 'all' && activeTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.type', 'Type')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="bg-[#0D1117] border-white/10">
            <SelectItem value="all" className="text-white/80 focus:bg-white/5"><DotLabel tone="muted">{t('crm.allTypes', 'All types')}</DotLabel></SelectItem>
            <SelectItem value="residential" className="text-white/80 focus:bg-white/5"><DotLabel tone="blue">{t('crm.sites.type.residential', 'Residential')}</DotLabel></SelectItem>
            <SelectItem value="commercial" className="text-white/80 focus:bg-white/5"><DotLabel tone="emerald">{t('crm.sites.type.commercial', 'Commercial')}</DotLabel></SelectItem>
            <SelectItem value="industrial" className="text-white/80 focus:bg-white/5"><DotLabel tone="amber">{t('crm.sites.type.industrial', 'Industrial')}</DotLabel></SelectItem>
          </SelectContent>
        </Select>

        <Select value={cantonFilter} onValueChange={setCantonFilter}>
          <SelectTrigger className={cn(baseTriggerCls, cantonFilter !== 'all' && activeTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.canton', 'Canton')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="max-h-72 bg-[#0D1117] border-white/10">
            <SelectItem value="all" className="text-white/80 focus:bg-white/5">{t('crm.allCantons', 'All cantons')}</SelectItem>
            {CH_CANTONS.map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-white/80 focus:bg-white/5">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-white/35">{c.code}</span>{c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-white/8" />
            <Button variant="ghost" size="sm" className="h-8 text-[12px] text-white/35 gap-1 rounded-full hover:text-red-400 hover:bg-red-500/10" onClick={clear}>
              <X className="h-3 w-3" /> {t('common.reset', 'Reset')}
            </Button>
          </>
        )}
      </div>

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
    </div>
  );
}
