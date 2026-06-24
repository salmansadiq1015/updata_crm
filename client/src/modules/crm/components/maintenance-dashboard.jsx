'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Save, Settings2, ShieldAlert,
} from 'lucide-react';
import {
  MAINTENANCE_TYPE_META, MAINTENANCE_STATUS_META,
  INSTALLATION_TYPE_META,
} from '@/modules/crm/constants/crm-constants';

const DEFAULT_ESCALATION_DAYS = 30;
const MIN_ESCALATION_DAYS = 1;
const MAX_ESCALATION_DAYS = 365;
const DAY_MS = 1000 * 60 * 60 * 24;
const EMPTY_MAINTENANCE_ITEMS = [];

export function MaintenanceDashboard() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('overdue');
  const [escalationDraftOverride, setEscalationDraftOverride] = useState(null);

  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: queryKeys.crm.maintenance.dashboard(),
    queryFn: () => maintenanceService.getDashboard(),
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: queryKeys.crm.maintenance.settings(),
    queryFn: () => maintenanceService.getSettings(),
  });

  const { data: overdueRes, isLoading: loadingOverdue } = useQuery({
    queryKey: queryKeys.crm.maintenance.overdue({ limit: 50 }),
    queryFn: () => maintenanceService.listOverdue({ limit: 50 }),
  });

  const { data: dueRes, isLoading: loadingDue } = useQuery({
    queryKey: queryKeys.crm.maintenance.due({ limit: 50 }),
    queryFn: () => maintenanceService.listDue({ limit: 50 }),
  });

  const overdueItems = useMemo(
    () => overdueRes?.data ?? EMPTY_MAINTENANCE_ITEMS,
    [overdueRes?.data],
  );
  const dueItems = useMemo(
    () => dueRes?.data ?? EMPTY_MAINTENANCE_ITEMS,
    [dueRes?.data],
  );

  const stats = dashboard || { overdue: 0, due: 0, scheduled: 0, ok: 0, total: 0 };
  const escalationDays = Number.isInteger(settings?.escalationDays)
    ? settings.escalationDays
    : DEFAULT_ESCALATION_DAYS;
  const escalationDraft = escalationDraftOverride
    ?? (Number.isInteger(settings?.escalationDays) ? String(settings.escalationDays) : '');
  const overdueSummary = useMemo(
    () => summarizeOverdueItems(overdueItems, escalationDays),
    [overdueItems, escalationDays],
  );

  const exportCsv = useMutation({
    mutationFn: (status) => maintenanceService.exportCsv({ status }),
    onSuccess: (res) => {
      showSuccess(t('crm.exportReady', 'Export ready') + (res?.filename ? ` — ${res.filename}` : ''));
    },
    onError: (err) => showError(err.message),
  });

  const updateSettings = useMutation({
    mutationFn: (payload) => maintenanceService.updateSettings(payload),
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(queryKeys.crm.maintenance.settings(), updatedSettings);
      setEscalationDraftOverride(null);
      showSuccess(t('crm.maintenance.escalationSaved', 'Escalation threshold saved'));
    },
    onError: (err) => showError(err.message),
  });

  const saveEscalationSettings = () => {
    const days = Number(escalationDraft);
    if (!Number.isInteger(days) || days < MIN_ESCALATION_DAYS || days > MAX_ESCALATION_DAYS) {
      showError(t('crm.maintenance.escalationInvalid', 'Enter a value between 1 and 365 days.'));
      return;
    }
    updateSettings.mutate({ escalationDays: days });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10 ring-1 ring-orange-500/20 shrink-0">
            <Wrench className="h-5 w-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold text-foreground leading-tight">
              {t('crm.maintenance.title', 'Maintenance')}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {t('crm.maintenance.description', 'Overview of overdue, upcoming, and scheduled maintenance.')}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <EscalationSettingsControl
            draft={escalationDraft}
            escalationDays={escalationDays}
            loading={loadingSettings}
            saving={updateSettings.isPending}
            onDraftChange={setEscalationDraftOverride}
            onSave={saveEscalationSettings}
            t={t}
          />
          <PermissionGate permission="crm:read">
            <Button
              variant="outline"
              onClick={() => exportCsv.mutate(tab === 'due' ? 'due' : tab === 'overdue' ? 'overdue' : 'all')}
              disabled={exportCsv.isPending}
              className="gap-2 h-9 border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            >
              <Download className="h-4 w-4" />
              {exportCsv.isPending ? t('common.exporting', 'Exporting...') : t('crm.exportCsv', 'Export CSV')}
            </Button>
          </PermissionGate>
        </div>
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

      {(stats.overdue ?? 0) > 0 && (
        <OverduePriorityBanner
          count={stats.overdue ?? overdueItems.length}
          oldestDays={overdueSummary.oldestDays}
          threshold={escalationDays}
          onView={() => setTab('overdue')}
          t={t}
        />
      )}

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
          <MaintenanceList items={overdueItems} loading={loadingOverdue} emptyMessage={t('crm.maintenance.noOverdue', 'No overdue maintenance.')} allGoodMessage={t('crm.maintenance.allGood', 'Everything is up to date.')} escalationDays={escalationDays} t={t} />
        </TabsContent>
        <TabsContent value="due">
          <MaintenanceList items={dueItems} loading={loadingDue} emptyMessage={t('crm.maintenance.noDue', 'No upcoming maintenance.')} allGoodMessage={t('crm.maintenance.allGood', 'Everything is up to date.')} escalationDays={escalationDays} t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EscalationSettingsControl({
  draft,
  escalationDays,
  loading,
  saving,
  onDraftChange,
  onSave,
  t,
}) {
  const draftValue = Number(draft);
  const invalid = draft === ''
    || !Number.isInteger(draftValue)
    || draftValue < MIN_ESCALATION_DAYS
    || draftValue > MAX_ESCALATION_DAYS;
  const unchanged = !invalid && draftValue === escalationDays;

  return (
    <PermissionGate permission="crm:admin">
      <div className="flex min-h-9 items-center gap-2 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5 text-foreground">
        <Settings2 className="h-4 w-4 shrink-0 text-red-700 dark:text-red-300" />
        <label htmlFor="maintenance-escalation-days" className="text-[12px] font-medium whitespace-nowrap">
          {t('crm.maintenance.escalationThreshold', 'Escalate after')}
        </label>
        <input
          id="maintenance-escalation-days"
          type="number"
          min={MIN_ESCALATION_DAYS}
          max={MAX_ESCALATION_DAYS}
          value={draft}
          placeholder={String(escalationDays)}
          disabled={loading || saving}
          onChange={(event) => onDraftChange(event.target.value)}
          className="h-7 w-16 rounded-lg border border-border bg-card px-2 text-center text-[13px] font-semibold text-foreground outline-none transition focus:border-red-400/60 focus:ring-2 focus:ring-red-400/15 disabled:opacity-50"
          aria-label={t('crm.maintenance.escalationThreshold', 'Escalate after')}
          aria-invalid={invalid}
        />
        <span className="text-[12px] text-muted-foreground">
          {t('crm.maintenance.escalationDaysUnit', 'days')}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={onSave}
          disabled={loading || saving || invalid || unchanged}
          className="ml-1 border-border bg-muted/60 text-foreground hover:bg-muted hover:text-foreground"
          aria-label={t('common.save', 'Save')}
          title={t('common.save', 'Save')}
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
      </div>
    </PermissionGate>
  );
}

function OverduePriorityBanner({ count, oldestDays, threshold, onView, t }) {
  return (
    <div className="rounded-xl border border-red-500/35 bg-red-500/[0.10] px-4 py-3 shadow-[0_18px_60px_rgba(239,68,68,0.14)]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/15 ring-1 ring-red-500/30">
            <ShieldAlert className="h-5 w-5 text-red-700 dark:text-red-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800 dark:text-red-100">
              {t('crm.maintenance.overdueAlertTitle', '{count} maintenance task(s) overdue', { count })}
            </p>
            <p className="mt-0.5 text-xs text-red-700/75 dark:text-red-100/65">
              {t('crm.maintenance.overdueAlertDesc', 'Oldest task is {days} days overdue. Escalation starts after {threshold} days.', {
                days: oldestDays ?? 0,
                threshold,
              })}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onView}
          className="border-red-400/30 bg-red-500/10 text-red-800 hover:bg-red-500/15 hover:text-red-900 dark:border-red-300/25 dark:bg-red-400/10 dark:text-red-50 dark:hover:bg-red-400/20 dark:hover:text-foreground"
        >
          {t('crm.maintenance.overdueAlertAction', 'Show overdue')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, loading, active, onClick }) {
  const themes = {
    red:     { bg: 'bg-red-500/10',     color: 'text-red-700 dark:text-red-400',     ring: 'ring-red-500/20',     activeBorder: 'border-red-500/40 ring-1 ring-red-500/20' },
    amber:   { bg: 'bg-amber-500/10',   color: 'text-amber-700 dark:text-amber-400',   ring: 'ring-amber-500/20',   activeBorder: 'border-amber-500/40 ring-1 ring-amber-500/20' },
    sky:     { bg: 'bg-sky-500/10',     color: 'text-sky-700 dark:text-sky-400',     ring: 'ring-sky-500/20',     activeBorder: 'border-sky-500/40 ring-1 ring-sky-500/20' },
    emerald: { bg: 'bg-emerald-500/10', color: 'text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-500/20', activeBorder: 'border-emerald-500/40 ring-1 ring-emerald-500/20' },
  };
  const theme = themes[accent] || themes.sky;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card p-5 transition-all text-left',
        onClick && 'hover:-translate-y-0.5 cursor-pointer',
        active ? theme.activeBorder : 'border-border hover:border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
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

/**
 * Buckets maintenance items by the calendar month of their nextDueDate.
 * Returns groups sorted chronologically; items without a date fall into a
 * trailing "no date" bucket. Each header uses a de-CH "MMMM yyyy" label.
 */
function groupByMonth(items, t) {
  const buckets = new Map();
  const NO_DATE_KEY = 'none';

  for (const m of items) {
    const date = m.nextDueDate ? new Date(m.nextDueDate) : null;
    const valid = date && !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}` : NO_DATE_KEY;

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        sortValue: valid ? date.getFullYear() * 12 + date.getMonth() : Number.POSITIVE_INFINITY,
        label: valid
          ? date.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
          : t('crm.maintenance.noDueDate', 'Kein Faelligkeitsdatum'),
        items: [],
      });
    }
    buckets.get(key).items.push(m);
  }

  return Array.from(buckets.values()).sort((a, b) => a.sortValue - b.sortValue);
}

function getDaysDiff(nextDueDate, now = new Date()) {
  if (!nextDueDate) return null;
  const date = new Date(nextDueDate);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS);
}

function getOverdueDays(nextDueDate, now = new Date()) {
  const daysDiff = getDaysDiff(nextDueDate, now);
  return daysDiff != null && daysDiff < 0 ? Math.abs(daysDiff) : 0;
}

function summarizeOverdueItems(items, escalationDays) {
  let oldestDays = 0;
  let criticalCount = 0;

  for (const item of items) {
    const overdueDays = getOverdueDays(item.nextDueDate);
    oldestDays = Math.max(oldestDays, overdueDays);
    if (item.escalated || overdueDays >= escalationDays) {
      criticalCount += 1;
    }
  }

  return { oldestDays, criticalCount };
}

function MaintenanceList({ items, loading, emptyMessage, allGoodMessage, escalationDays, t }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-muted/30 p-3.5 flex gap-3">
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
      <div className="rounded-xl border border-border bg-card p-8">
        <EmptyState
          title={emptyMessage}
          description={allGoodMessage}
          icon={CheckCircle2}
        />
      </div>
    );
  }

  const groups = groupByMonth(items, t);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 mb-2 px-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider capitalize">
              {group.label}
            </h3>
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted/70 px-1.5 text-[10px] font-medium text-muted-foreground">
              {group.items.length}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            {group.items.map((m) => (
              <MaintenanceDashboardRow
                key={m._id}
                item={m}
                escalationDays={escalationDays}
                t={t}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MaintenanceDashboardRow({ item: m, escalationDays, t }) {
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
  const daysDiff = getDaysDiff(m.nextDueDate);
  const overdueDays = getOverdueDays(m.nextDueDate);
  const isOverdue = m.maintenanceStatus === 'overdue';
  const isEscalated = Boolean(m.escalated);
  const isCritical = isOverdue && (isEscalated || overdueDays >= escalationDays);
  const daysLabel = daysDiff == null ? '--' :
    daysDiff < 0 ? t('crm.maintenance.daysOverdue', '{days} days overdue', { days: Math.abs(daysDiff) }) :
    daysDiff === 0 ? t('crm.maintenance.dueToday', 'Due today') :
    t('crm.maintenance.inDays', 'In {days} days', { days: daysDiff });

  return (
    <Link
      href={installation?._id ? `/crm/installations/${installation._id}` : '#'}
      className={cn(
        'group/row block rounded-xl border p-3.5 transition-all',
        isOverdue
          ? 'border-red-500/25 bg-red-500/[0.07] shadow-[inset_3px_0_0_rgba(248,113,113,0.65)] hover:border-red-400/45 hover:bg-red-500/[0.11]'
          : 'border-border bg-muted/30 hover:border-border hover:bg-muted/50',
        isCritical && 'border-red-400/45 bg-red-500/[0.12] shadow-[inset_3px_0_0_rgba(252,165,165,0.9),0_12px_40px_rgba(239,68,68,0.12)]',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'h-10 w-10 shrink-0 rounded-lg flex items-center justify-center',
          isOverdue ? 'bg-red-500/15 ring-1 ring-red-500/25' : typeMeta.bg,
        )}>
          <TypeIcon className={cn('h-4 w-4', isOverdue ? 'text-red-700 dark:text-red-300' : typeMeta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[13px] font-semibold text-foreground">{typeLabel}</p>
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md', statusMeta.bg, statusMeta.color)}>
              <span className={cn('h-1 w-1 rounded-full', statusMeta.dot)} />
              {t(`crm.maintenance.status.${m.maintenanceStatus}`, statusMeta.label)}
            </span>
            {isCritical && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-300/20 dark:text-red-200">
                <ShieldAlert className="h-3 w-3" />
                {isEscalated
                  ? t('crm.maintenance.escalated', 'Escalated')
                  : t('crm.maintenance.escalationDue', 'Escalation due')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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
            {customerName && <span>- {customerName}</span>}
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className={cn('text-xs font-semibold', isCritical ? 'text-red-800 dark:text-red-200' : isOverdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400')}>
            {daysLabel}
          </p>
          {nextDate && (
            <p className="text-[10px] text-muted-foreground">
              {formatDate(nextDate)}
            </p>
          )}
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground/60 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 mt-1" />
      </div>
    </Link>
  );
}
