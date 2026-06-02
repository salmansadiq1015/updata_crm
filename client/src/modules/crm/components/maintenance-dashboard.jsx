'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmptyState } from '@/shared/components/empty-state';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  AlertTriangle, Clock, CheckCircle2, Calendar,
  ArrowRight, Wrench, Building2, Download,
} from 'lucide-react';
import {
  MAINTENANCE_TYPE_META, MAINTENANCE_STATUS_META,
  INSTALLATION_TYPE_META,
} from '@/modules/crm/constants/crm-constants';

export function MaintenanceDashboard() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('overdue');

  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: queryKeys.crm.maintenance.dashboard(),
    queryFn: () => maintenanceService.getDashboard(),
  });

  const { data: overdueRes, isLoading: loadingOverdue } = useQuery({
    queryKey: queryKeys.crm.maintenance.overdue({ limit: 50 }),
    queryFn: () => maintenanceService.listOverdue({ limit: 50 }),
  });

  const { data: dueRes, isLoading: loadingDue } = useQuery({
    queryKey: queryKeys.crm.maintenance.due({ limit: 50 }),
    queryFn: () => maintenanceService.listDue({ limit: 50 }),
  });

  const overdueItems = overdueRes?.data ?? [];
  const dueItems = dueRes?.data ?? [];

  const stats = dashboard || { overdue: 0, due: 0, scheduled: 0, ok: 0, total: 0 };

  const exportCsv = useMutation({
    mutationFn: (status) => maintenanceService.exportCsv({ status }),
    onSuccess: (res) => {
      showSuccess(t('crm.exportReady', 'Export ready') + (res?.filename ? ` — ${res.filename}` : ''));
    },
    onError: (err) => showError(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 ring-1 ring-orange-500/20 shrink-0">
            <Wrench className="h-5 w-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold text-white/90 leading-tight">
              {t('crm.maintenance.title', 'Maintenance')}
            </h1>
            <p className="text-[13px] text-white/40 mt-0.5">
              {t('crm.maintenance.description', 'Overview of overdue, upcoming, and scheduled maintenance.')}
            </p>
          </div>
        </div>
        <PermissionGate permission="crm:read">
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate(tab === 'due' ? 'due' : tab === 'overdue' ? 'overdue' : 'all')}
            disabled={exportCsv.isPending}
            className="gap-2 h-9 border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white/80"
          >
            <Download className="h-4 w-4" />
            {exportCsv.isPending ? t('common.exporting', 'Exporting...') : t('crm.exportCsv', 'Export CSV')}
          </Button>
        </PermissionGate>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('crm.maintenance.stats.overdue', 'Overdue')}
          value={stats.overdue ?? 0}
          icon={AlertTriangle}
          accent="red"
          loading={loadingDash}
          active={tab === 'overdue'}
          onClick={() => setTab('overdue')}
        />
        <StatCard
          label={t('crm.maintenance.stats.due', 'Due')}
          value={stats.due ?? 0}
          icon={Clock}
          accent="amber"
          loading={loadingDash}
          active={tab === 'due'}
          onClick={() => setTab('due')}
        />
        <StatCard
          label={t('crm.maintenance.stats.scheduled', 'Scheduled')}
          value={stats.scheduled ?? 0}
          icon={Calendar}
          accent="sky"
          loading={loadingDash}
        />
        <StatCard
          label={t('crm.maintenance.stats.ok', 'OK')}
          value={stats.ok ?? 0}
          icon={CheckCircle2}
          accent="emerald"
          loading={loadingDash}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('crm.maintenance.tab.overdue', 'Overdue')}
            {overdueItems.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {overdueItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="due" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {t('crm.maintenance.tab.due', 'Due')}
            {dueItems.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                {dueItems.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue">
          <MaintenanceList items={overdueItems} loading={loadingOverdue} emptyMessage={t('crm.maintenance.noOverdue', 'No overdue maintenance.')} allGoodMessage={t('crm.maintenance.allGood', 'Everything is up to date.')} t={t} />
        </TabsContent>
        <TabsContent value="due">
          <MaintenanceList items={dueItems} loading={loadingDue} emptyMessage={t('crm.maintenance.noDue', 'No upcoming maintenance.')} allGoodMessage={t('crm.maintenance.allGood', 'Everything is up to date.')} t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, loading, active, onClick }) {
  const themes = {
    red:     { bg: 'bg-red-500/10',     color: 'text-red-400',     ring: 'ring-red-500/20',     activeBorder: 'border-red-500/40 ring-1 ring-red-500/20' },
    amber:   { bg: 'bg-amber-500/10',   color: 'text-amber-400',   ring: 'ring-amber-500/20',   activeBorder: 'border-amber-500/40 ring-1 ring-amber-500/20' },
    sky:     { bg: 'bg-sky-500/10',     color: 'text-sky-400',     ring: 'ring-sky-500/20',     activeBorder: 'border-sky-500/40 ring-1 ring-sky-500/20' },
    emerald: { bg: 'bg-emerald-500/10', color: 'text-emerald-400', ring: 'ring-emerald-500/20', activeBorder: 'border-emerald-500/40 ring-1 ring-emerald-500/20' },
  };
  const theme = themes[accent] || themes.sky;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-[#0D1117] p-5 transition-all text-left',
        onClick && 'hover:-translate-y-0.5 cursor-pointer',
        active ? theme.activeBorder : 'border-white/6 hover:border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-16 mt-2" />
          ) : (
            <p className={cn('text-3xl font-bold tracking-tight leading-none mt-2', theme.color)}>{value}</p>
          )}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1', theme.bg, theme.ring)}>
          <Icon className={cn('h-5 w-5', theme.color)} />
        </div>
      </div>
    </button>
  );
}

function MaintenanceList({ items, loading, emptyMessage, allGoodMessage, t }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-white/2 p-3.5 flex gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-white/6 bg-[#0D1117] p-8">
        <EmptyState
          title={emptyMessage}
          description={allGoodMessage}
          icon={CheckCircle2}
        />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/6 bg-[#0D1117] p-4 space-y-2">
      {items.map((m) => <MaintenanceDashboardRow key={m._id} item={m} t={t} />)}
    </div>
  );
}

function MaintenanceDashboardRow({ item: m, t }) {
  const typeMeta = MAINTENANCE_TYPE_META[m.maintenanceType] || MAINTENANCE_TYPE_META.other;
  const statusMeta = MAINTENANCE_STATUS_META[m.maintenanceStatus] || MAINTENANCE_STATUS_META.ok;
  const typeLabel = m.maintenanceType === 'other' && m.customTypeLabel
    ? m.customTypeLabel
    : t(`crm.maintenance.type.${m.maintenanceType}`, typeMeta.label);
  const TypeIcon = typeMeta.icon;

  const installation = m.installationId;
  const instMeta = installation?.type ? INSTALLATION_TYPE_META[installation.type] : null;
  const customerName = installation?.siteId?.customerId?.name;
  const siteName = installation?.siteId?.name;

  const nextDate = m.nextDueDate ? new Date(m.nextDueDate) : null;
  const now = new Date();
  const daysDiff = nextDate ? Math.floor((nextDate - now) / (1000 * 60 * 60 * 24)) : null;
  const daysLabel = daysDiff == null ? '—' :
    daysDiff < 0 ? t('crm.maintenance.daysOverdue', '{days} days overdue', { days: Math.abs(daysDiff) }) :
    daysDiff === 0 ? t('crm.maintenance.dueToday', 'Due today') :
    t('crm.maintenance.inDays', 'In {days} days', { days: daysDiff });

  return (
    <Link
      href={installation?._id ? `/crm/installations/${installation._id}` : '#'}
      className="group/row block rounded-xl border border-white/5 bg-white/2 p-3.5 hover:border-white/10 hover:bg-white/4 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 shrink-0 rounded-lg flex items-center justify-center', typeMeta.bg)}>
          <TypeIcon className={cn('h-4 w-4', typeMeta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[13px] font-semibold text-white/80">{typeLabel}</p>
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md', statusMeta.bg, statusMeta.color)}>
              <span className={cn('h-1 w-1 rounded-full', statusMeta.dot)} />
              {t(`crm.maintenance.status.${m.maintenanceStatus}`, statusMeta.label)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
            {instMeta && (
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-2.5 w-2.5" /> {t(`crm.installations.type.${installation?.type}`, instMeta.label)}
              </span>
            )}
            {siteName && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-2.5 w-2.5" /> {siteName}
              </span>
            )}
            {customerName && <span>· {customerName}</span>}
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className={cn('text-xs font-semibold', m.maintenanceStatus === 'overdue' ? 'text-red-400' : 'text-amber-400')}>
            {daysLabel}
          </p>
          {nextDate && (
            <p className="text-[10px] text-white/35">
              {formatDate(nextDate)}
            </p>
          )}
        </div>

        <ArrowRight className="h-4 w-4 text-white/25 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 mt-1" />
      </div>
    </Link>
  );
}
