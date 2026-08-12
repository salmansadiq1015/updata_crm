'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench, CalendarClock, CalendarCheck, FolderKanban, Layers, ChevronRight,
  Flame, KeyRound, MonitorSpeaker, ListChecks,
} from 'lucide-react';
import { installationService } from '@/modules/crm/services/installation-service';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { projectService } from '@/modules/pm/services/project-service';
import { taskService } from '@/modules/tasks/services/task-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';

const fmt = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * Object landing tab: one Schnellzugriff list holding every key figure of the
 * object (components, maintenance dates, Objektinformationen), the current
 * projects, and the open tasks grouped by department.
 */
export function SiteOverviewTab({ siteId, site, onNavigate }) {
  const { t, language } = useLanguage();

  const { data: installations = [], isLoading: loadingInst } = useQuery({
    queryKey: ['crm', 'installations', 'site', siteId],
    queryFn: () => installationService.listBySite(siteId),
    enabled: !!siteId,
  });
  const { data: maintenance = [], isLoading: loadingMaint } = useQuery({
    queryKey: ['crm', 'maintenance', 'site', siteId],
    queryFn: () => maintenanceService.listBySite(siteId),
    enabled: !!siteId,
  });
  const { data: projData, isLoading: loadingProj } = useQuery({
    queryKey: ['pm', 'projects', 'site', siteId],
    queryFn: () => projectService.getProjects({ siteId, limit: 100, sortOrder: 'desc' }),
    enabled: !!siteId,
  });
  const projects = projData?.data || projData?.items || (Array.isArray(projData) ? projData : []);

  const { lastService, nextService } = useMemo(() => {
    let last = null;
    let next = null;
    for (const m of maintenance) {
      if (m.lastServiceDate) { const d = new Date(m.lastServiceDate); if (!last || d > last) last = d; }
      if (m.nextDueDate) { const d = new Date(m.nextDueDate); if (!next || d < next) next = d; }
    }
    return { lastService: last, nextService: next };
  }, [maintenance]);

  const yesNo = (v) => (v ? t('crm.sites.yes', 'Ja') : t('crm.sites.no', 'Nein'));
  const eh = site?.emergencyHeating;
  const kb = site?.keyBox;
  const ab = site?.advertisingBoard;

  // One list, so nothing about the object needs a second look elsewhere:
  // counts, Objektinformationen (with their details) and service dates.
  const rows = [
    {
      key: 'installations', icon: Layers, accent: 'text-brand-600',
      label: t('crm.installations.title', 'Komponenten'),
      value: installations.length, loading: loadingInst, tab: 'installations',
    },
    {
      key: 'maintenance', icon: Wrench, accent: 'text-emerald-600',
      label: t('crm.maintenance.objectTitle', 'Wartungen'),
      value: maintenance.length, loading: loadingMaint, tab: 'maintenance',
    },
    {
      key: 'emergencyHeating', icon: Flame, accent: 'text-orange-500',
      label: t('crm.sites.emergencyHeating', 'Notheizung'),
      value: yesNo(eh?.present),
      details: [eh?.number && { label: t('crm.sites.number', 'Nummer'), value: eh.number }],
    },
    {
      key: 'keyBox', icon: KeyRound, accent: 'text-sky-500',
      label: t('crm.sites.keyBox', 'Schlüsselbox'),
      value: yesNo(kb?.present),
      details: [
        kb?.code && { label: t('crm.sites.keyBoxCode', 'Code'), value: kb.code },
        kb?.depositedBy && { label: t('crm.sites.keyBoxDepositedBy', 'Deponiert von'), value: kb.depositedBy },
        kb?.depositedAt && { label: t('crm.sites.keyBoxDepositedAt', 'Deponiert am'), value: fmt(kb.depositedAt) },
      ],
    },
    {
      key: 'advertisingBoard', icon: MonitorSpeaker, accent: 'text-violet-500',
      label: t('crm.sites.advertisingBoard', 'Werbetafeln'),
      value: ab?.count ?? 0,
      details: [
        ab?.type && { label: t('crm.sites.advertisingType', 'Typ'), value: ab.type },
        ab?.location && { label: t('crm.sites.advertisingLocation', 'Standort'), value: ab.location },
      ],
    },
    {
      key: 'lastService', icon: CalendarCheck, accent: 'text-sky-600',
      label: t('crm.maintenance.lastServiceDate', 'Letzte Wartung'),
      value: fmt(lastService), loading: loadingMaint, tab: 'maintenance',
    },
    {
      key: 'nextService', icon: CalendarClock, accent: 'text-amber-600',
      label: t('crm.maintenance.nextServiceDate', 'Nächste Wartung'),
      value: fmt(nextService), loading: loadingMaint, tab: 'maintenance',
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Schnellzugriff */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">{t('crm.sites.quickAccess', 'Schnellzugriff')}</h3>
        <ul className="divide-y divide-border/60">
          {rows.map((row) => {
            const Icon = row.icon;
            const details = (row.details || []).filter(Boolean);
            const clickable = !!row.tab;
            const Wrapper = clickable ? 'button' : 'div';
            return (
              <li key={row.key}>
                <Wrapper
                  {...(clickable ? { type: 'button', onClick: () => onNavigate?.(row.tab) } : {})}
                  className={cn(
                    'flex w-full items-baseline gap-3 px-1 py-2 text-left',
                    clickable && 'rounded-md transition-colors hover:bg-muted/50',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0 self-center', row.accent)} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.label}</span>
                  {row.loading
                    ? <Skeleton className="h-4 w-10" />
                    : <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{row.value}</span>}
                </Wrapper>
                {details.length > 0 && (
                  <p className="px-1 pb-2 pl-8 text-[11px] leading-relaxed text-muted-foreground">
                    {details.map((d) => `${d.label}: ${d.value}`).join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Aktuelle Projekte */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('crm.sites.currentProjects', 'Aktuelle Projekte')}</h3>
          {projects.length > 0 && (
            <button type="button" onClick={() => onNavigate?.('projects')} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              {t('crm.sites.allProjects', 'Alle anzeigen')} <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
        {loadingProj ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : projects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('crm.sites.projectsEmpty', 'Keine Projekte')}</p>
        ) : (
          <div className="space-y-1.5">
            {projects.slice(0, 5).map((p) => {
              const cfg = PROJECT_STATUS_CONFIG[p.status] || PROJECT_STATUS_CONFIG.DRAFT;
              return (
                <Link key={p._id} href={`/projects/${p._id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                  <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', cfg.bgColor, cfg.textColor, cfg.borderColor)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotColor)} />
                    {language === 'en' ? cfg.labelEn : cfg.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <OpenTasksCard siteId={siteId} onNavigate={onNavigate} t={t} />
    </div>
  );
}

/** Open tasks of the object, grouped by department (Abteilung). */
function OpenTasksCard({ siteId, onNavigate, t }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'site-overview', siteId],
    queryFn: () => taskService.siteOverview(siteId),
    enabled: !!siteId,
    staleTime: 20_000,
  });
  const byDepartment = data?.byDepartment || [];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('crm.sites.openTasks', 'Offene Aufgaben (Übersicht)')}</h3>
        {byDepartment.length > 0 && (
          <button type="button" onClick={() => onNavigate?.('tasks')} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            {t('crm.sites.allTasks', 'Alle anzeigen')} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
      ) : byDepartment.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('crm.sites.tasksEmpty', 'Keine offenen Aufgaben')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {byDepartment.map((dep) => (
            <li key={dep.departmentId || 'none'}>
              <button
                type="button"
                onClick={() => onNavigate?.('tasks')}
                className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dep.color || 'var(--muted-foreground)' }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {dep.name || t('crm.sites.tasksNoDepartment', 'Ohne Abteilung')}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{dep.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
