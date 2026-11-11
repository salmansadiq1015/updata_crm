'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Search, LayoutGrid, Rows3, TriangleAlert, X, Truck, ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/shared/components/empty-state';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useAiStore } from '@/modules/ai/store/ai-store';
import { useVehicles, useVehicleStats, useVehicleMutations } from '@/modules/vehicles/hooks/use-vehicles';
import { VehiclesTable, VehicleCard, VehicleCardSkeleton } from '@/modules/vehicles/components/vehicles-table';
import { VehicleFormDialog } from '@/modules/vehicles/components/vehicle-form-dialog';
import { FleetHero } from '@/modules/vehicles/components/fleet-hero';
import { VEHICLE_STATUSES, VEHICLE_ASSET_TYPES, STATUS_TONES } from '@/modules/vehicles/lib/fleet-meta';

const PAGE_SIZE = 24;
const VIEW_KEY = 'fleet:view';

export function FleetPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission, isAdmin } = usePermissions();
  const canWrite = isAdmin || hasPermission('vehicles:write');
  const openPanelWithPrompt = useAiStore((s) => s.openPanelWithPrompt);

  // Filters live in the URL so a filtered fleet view can be shared and survives reloads.
  const status = searchParams.get('status') || 'active';
  const assetType = searchParams.get('type') || 'all';
  const attention = searchParams.get('attention') === '1';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [view, setView] = useState('grid');
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const debouncedSearch = useDebounce(search, 300).trim();

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'grid' || v === 'table') setView(v); } catch { /* storage blocked */ }
  }, []);
  const changeView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ } };

  const setParams = useCallback((patch) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '' || v === false) next.delete(k); else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if ((searchParams.get('q') || '') !== debouncedSearch) setParams({ q: debouncedSearch || null });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status !== 'active' ? { status } : {}),
    ...(assetType !== 'all' ? { assetType } : {}),
    ...(attention ? { attention: true } : {}),
    page,
    limit: PAGE_SIZE,
  }), [debouncedSearch, status, assetType, attention, page]);

  const { data, isLoading, isFetching, isError, refetch } = useVehicles(params);
  const { data: stats, isLoading: statsLoading } = useVehicleStats();
  const { create } = useVehicleMutations();
  const vehicles = data?.items || [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const filtered = Boolean(debouncedSearch) || status !== 'active' || assetType !== 'all' || attention;

  const askAi = () => openPanelWithPrompt(t('fleet.ai.prompt', 'Which vehicles need attention in the next 30 days?'));

  const statusChips = ['active', ...VEHICLE_STATUSES];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <FleetHero
        stats={stats}
        loading={statsLoading}
        canWrite={canWrite}
        onAdd={() => setCreateOpen(true)}
        onAskAi={askAi}
        onShowAttention={() => setParams({ attention: attention ? null : '1' })}
      />

      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-col gap-3 rounded-2xl bg-background/80 px-1 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('fleet.searchPlaceholder', 'Search plate, make, model, fleet no., location…')}
              aria-label={t('fleet.search', 'Search vehicles')}
              className="h-11 rounded-xl ps-10 pe-9"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label={t('common.clear', 'Clear')}>
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <Select value={assetType} onValueChange={(v) => setParams({ type: v === 'all' ? null : v })}>
            <SelectTrigger className="h-11 w-[190px] rounded-xl" aria-label={t('fleet.field.assetType', 'Type')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fleet.type.all', 'All types')}</SelectItem>
              {VEHICLE_ASSET_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`fleet.type.${type}`, type)}{stats?.byType?.[type] ? ` (${stats.byType[type]})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setParams({ attention: attention ? null : '1' })}
            aria-pressed={attention}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition',
              attention ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-input bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <TriangleAlert className="size-4" aria-hidden="true" />
            {t('fleet.kpi.attention', 'Needs attention')}
            {stats?.attention ? <span className="rounded-full bg-amber-500/15 px-1.5 text-xs tabular-nums">{stats.attention}</span> : null}
          </button>
          <div className="flex h-11 items-center rounded-xl border border-input bg-background p-1" role="group" aria-label={t('fleet.view', 'View')}>
            {[['grid', LayoutGrid], ['table', Rows3]].map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => changeView(key)}
                aria-pressed={view === key}
                aria-label={t(`fleet.view.${key}`, key)}
                className={cn('grid h-full w-9 place-items-center rounded-lg transition', view === key ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="tablist" aria-label={t('fleet.field.status', 'Status')}>
          {statusChips.map((s) => {
            const active = status === s;
            const count = s === 'active' ? stats?.total : stats?.byStatus?.[s];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParams({ status: s === 'active' ? null : s })}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition',
                  active ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200' : 'border-border bg-card text-muted-foreground hover:border-sky-500/25 hover:text-foreground',
                )}
              >
                {s !== 'active' ? <span className={cn('size-1.5 rounded-full', STATUS_TONES[s].dot)} aria-hidden="true" /> : null}
                {s === 'active' ? t('fleet.status.active', 'All active') : t(`fleet.status.${s}`, s)}
                {count != null ? <span className="tabular-nums text-xs opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={t('fleet.error.title', 'The fleet could not be loaded')}
          description={t('fleet.error.desc', 'Check your connection and try again.')}
          action={<Button variant="outline" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>}
        />
      ) : !isLoading && vehicles.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={filtered ? t('fleet.empty.filteredTitle', 'No vehicles match') : t('fleet.empty.title', 'Your fleet starts here')}
          description={filtered ? t('fleet.empty.filteredDesc', 'Try another search or clear the filters.') : t('fleet.empty.desc', 'Add your first vehicle or machine to track drivers, service, costs and bookings.')}
          action={filtered ? (
            <Button variant="outline" onClick={() => { setSearch(''); router.replace(pathname); }}>{t('fleet.clearFilters', 'Clear filters')}</Button>
          ) : canWrite ? (
            <Button className="gap-2" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{t('fleet.add', 'Add vehicle')}</Button>
          ) : null}
        />
      ) : view === 'grid' ? (
        <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 transition-opacity', isFetching && !isLoading && 'opacity-70')}>
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <VehicleCardSkeleton key={i} />) : vehicles.map((v) => <VehicleCard key={v._id} vehicle={v} />)}
        </div>
      ) : (
        <div className={cn('transition-opacity', isFetching && !isLoading && 'opacity-70')}>
          <VehiclesTable vehicles={vehicles} loading={isLoading} />
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm text-muted-foreground" aria-label={t('common.pagination', 'Pagination')}>
          <span className="tabular-nums">{t('fleet.pageInfo', '{from}–{to} of {total}', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={page <= 1} onClick={() => setParams({ page: page - 1 })}><ChevronLeft className="size-4 rtl:rotate-180" />{t('common.previous', 'Previous')}</Button>
            <Button variant="outline" size="sm" className="gap-1" disabled={page >= pages} onClick={() => setParams({ page: page + 1 })}>{t('common.next', 'Next')}<ChevronRight className="size-4 rtl:rotate-180" /></Button>
          </div>
        </nav>
      ) : null}

      <VehicleFormDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o && searchParams.get('new')) setParams({ new: null }); }}
        onSubmit={async (payload) => {
          const created = await create.mutateAsync(payload);
          if (created?._id) router.push(`/vehicles/${created._id}`);
        }}
        isLoading={create.isPending}
      />
    </div>
  );
}
