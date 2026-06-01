'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { installationService } from '@/modules/crm/services/installation-service';
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
import { formatDate, formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Wrench, Eye, ExternalLink, Filter, Search, X, Zap, Flame } from 'lucide-react';
import { INSTALLATION_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { DotLabel } from '@/shared/components/filter-dot';

const INSTALLATION_TYPE_TONE = {
  boiler: 'rose',
  heat_pump: 'sky',
  solar_thermal: 'amber',
  radiator_system: 'orange',
  ventilation: 'indigo',
  hot_water: 'blue',
  other: 'violet',
};

const FUEL_TONE = {
  gas: 'sky',
  oil: 'amber',
  electric: 'violet',
  pellet: 'emerald',
  other: 'muted',
};

const baseTriggerCls = 'rounded-full px-3 py-1.5 text-[12px] font-medium border border-white/10 bg-white/4 text-white/55 hover:bg-white/8 hover:text-white/80 transition-all h-8';
const activeTriggerCls = 'border-violet-500/30 bg-violet-500/15 text-violet-300';

export function InstallationsTable() {
  const { t } = useLanguage();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fuelFilter, setFuelFilter] = useState('all');

  const debouncedSearch = useDebounce(search, 300);

  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.type = typeFilter;
    if (fuelFilter !== 'all') p.fuelType = fuelFilter;
    return p;
  }, [debouncedSearch, statusFilter, typeFilter, fuelFilter]);

  const {
    items, pageSize, setPageSize, hasNext, hasPrev, isFetching, onNext, onPrev, reset,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.installations.list(merged),
    queryFn: (merged) => installationService.list(merged),
    params: apiParams,
    initialSize: 25,
  });

  const hasActiveFilters =
    !!search || statusFilter !== 'all' || typeFilter !== 'all' || fuelFilter !== 'all';

  const clear = () => {
    setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setFuelFilter('all'); reset();
  };

  const pageStats = useMemo(() => {
    const total = items.length;
    const active = items.filter((i) => i.status === 'active').length;
    const decommissioned = items.filter((i) => i.status === 'decommissioned').length;
    const totalKw = items.reduce((sum, i) => sum + (i.powerOutputKw || 0), 0);
    return { total, active, decommissioned, totalKw };
  }, [items]);

  const columns = useMemo(() => [
    {
      accessorKey: 'installationNumber',
      header: t('crm.installations.title', 'Installation'),
      size: 280,
      Cell: ({ row }) => {
        const i = row.original;
        const meta = INSTALLATION_TYPE_META[i.type] || INSTALLATION_TYPE_META.other;
        const Icon = meta.icon || Wrench;
        return (
          <Link href={`/crm/installations/${i._id}`} className="flex items-center gap-3 group min-w-0">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 ring-white/8 shrink-0', meta.bg)}>
              <Icon className={cn('h-4 w-4', meta.color)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[13px] text-white/80 truncate group-hover:text-white/90 transition-colors">
                  {t(`crm.installations.type.${i.type}`, meta.label)}
                </span>
                {i.installationNumber && (
                  <span className="text-[10px] font-mono text-white/35 shrink-0">{i.installationNumber}</span>
                )}
              </div>
              {(i.manufacturer || i.model) && (
                <p className="text-xs text-white/40 truncate">
                  {[i.manufacturer, i.model].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'siteName',
      header: t('crm.sites.name', 'Site'),
      size: 200,
      Cell: ({ row }) => {
        const siteName = row.original.siteId?.name;
        if (!siteName) return <span className="text-[13px] text-white/25">—</span>;
        const siteId = row.original.siteId?._id || row.original.siteId;
        return (
          <Link href={`/crm/sites/${siteId}`} className="text-[13px] text-white/80 hover:text-white/90 transition-colors truncate">
            {siteName}
          </Link>
        );
      },
    },
    {
      accessorKey: 'fuelType',
      header: t('crm.installations.fuel', 'Fuel'),
      size: 120,
      Cell: ({ row }) => {
        const fuel = row.original.fuelType;
        if (!fuel) return <span className="text-[13px] text-white/25">—</span>;
        return (
          <span className="inline-flex items-center gap-1 text-[13px] text-white/80">
            <Flame className="h-3 w-3 text-orange-400" />
            {t(`crm.installations.fuel.${fuel}`, fuel)}
          </span>
        );
      },
    },
    {
      accessorKey: 'powerOutputKw',
      header: t('crm.installations.power', 'Power'),
      size: 100,
      Cell: ({ row }) => row.original.powerOutputKw ? (
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-white/80">
          <Zap className="h-3 w-3 text-amber-400" />
          {formatNumber(row.original.powerOutputKw, { decimals: 1 })} kW
        </span>
      ) : <span className="text-[13px] text-white/25">—</span>,
    },
    {
      accessorKey: 'commissioningDate',
      header: t('crm.installations.commissioning', 'Commissioned'),
      size: 140,
      Cell: ({ row }) => <span className="text-[13px] text-white/80">{formatDate(row.original.commissioningDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: t('crm.status', 'Status'),
      size: 140,
      Cell: ({ row }) => {
        const status = row.original.status;
        const active = status === 'active';
        return (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full',
            active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/40',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-white/20')} />
            {active ? t('crm.statusActive', 'Active') : t('crm.installations.statusDecommissioned', 'Decommissioned')}
          </span>
        );
      },
    },
  ], [t]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shrink-0">
          <Wrench className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold text-white/90 leading-tight">
            {t('crm.installations.listTitle', 'Installations')}
          </h1>
          <p className="text-[13px] text-white/40 mt-0.5">
            {items.length} {t('crm.installations.listDesc', 'installations across all sites')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard label={t('crm.stats.total', 'Total')} value={pageStats.total} icon={Wrench} accent="violet" />
        <PremiumStatCard label={t('crm.statusActive', 'Active')} value={pageStats.active} accent="emerald" />
        <PremiumStatCard label={t('crm.installations.statusDecommissioned', 'Decommissioned')} value={pageStats.decommissioned} accent="rose" />
        <PremiumStatCard label={t('crm.installations.totalPower', 'Total power')} value={formatNumber(pageStats.totalKw, { decimals: 1 })} suffix="kW" icon={Zap} accent="amber" />
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
            placeholder={t('crm.installations.searchPlaceholder', 'Search by number, manufacturer, model, serial...')}
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
            <SelectItem value="decommissioned" className="text-white/80 focus:bg-white/5"><DotLabel tone="slate">{t('crm.installations.statusDecommissioned', 'Decommissioned')}</DotLabel></SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={cn(baseTriggerCls, typeFilter !== 'all' && activeTriggerCls, 'w-44')}>
            <SelectValue placeholder={t('crm.type', 'Type')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="bg-[#0D1117] border-white/10">
            <SelectItem value="all" className="text-white/80 focus:bg-white/5"><DotLabel tone="muted">{t('crm.allTypes', 'All types')}</DotLabel></SelectItem>
            {Object.entries(INSTALLATION_TYPE_META).map(([key, meta]) => (
              <SelectItem key={key} value={key} className="text-white/80 focus:bg-white/5">
                <DotLabel tone={INSTALLATION_TYPE_TONE[key] || 'violet'}>
                  {t(`crm.installations.type.${key}`, meta.label)}
                </DotLabel>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fuelFilter} onValueChange={setFuelFilter}>
          <SelectTrigger className={cn(baseTriggerCls, fuelFilter !== 'all' && activeTriggerCls, 'w-37.5')}>
            <SelectValue placeholder={t('crm.installations.fuel', 'Fuel')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4} className="bg-[#0D1117] border-white/10">
            <SelectItem value="all" className="text-white/80 focus:bg-white/5"><DotLabel tone="muted">{t('crm.installations.allFuels', 'All fuels')}</DotLabel></SelectItem>
            <SelectItem value="gas" className="text-white/80 focus:bg-white/5"><DotLabel tone={FUEL_TONE.gas}>{t('crm.installations.fuel.gas', 'Gas')}</DotLabel></SelectItem>
            <SelectItem value="oil" className="text-white/80 focus:bg-white/5"><DotLabel tone={FUEL_TONE.oil}>{t('crm.installations.fuel.oil', 'Oil')}</DotLabel></SelectItem>
            <SelectItem value="electric" className="text-white/80 focus:bg-white/5"><DotLabel tone={FUEL_TONE.electric}>{t('crm.installations.fuel.electric', 'Electric')}</DotLabel></SelectItem>
            <SelectItem value="pellet" className="text-white/80 focus:bg-white/5"><DotLabel tone={FUEL_TONE.pellet}>{t('crm.installations.fuel.pellet', 'Pellet')}</DotLabel></SelectItem>
            <SelectItem value="other" className="text-white/80 focus:bg-white/5"><DotLabel tone={FUEL_TONE.other}>{t('crm.installations.fuel.other', 'Other')}</DotLabel></SelectItem>
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
          const i = row.original;
          const siteId = i.siteId?._id || i.siteId;
          return (
            <RowActionsMenu
              items={[
                {
                  label: t('common.view', 'View'),
                  icon: Eye,
                  onSelect: () => router.push(`/crm/installations/${i._id}`),
                },
                {
                  label: t('crm.openSite', 'Open site'),
                  icon: ExternalLink,
                  hidden: !siteId,
                  onSelect: () => router.push(`/crm/sites/${siteId}`),
                },
              ]}
            />
          );
        }}
      />
    </div>
  );
}
