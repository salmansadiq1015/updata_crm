'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench, CalendarClock, CalendarCheck, FolderKanban, Layers, ChevronRight,
} from 'lucide-react';
import { installationService } from '@/modules/crm/services/installation-service';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';

const fmt = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * Object landing tab: quick access counts + current projects. Purely derived
 * from existing data (components, maintenance, projects) — no new data model.
 */
export function SiteOverviewTab({ siteId, onNavigate }) {
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

  const stats = [
    { icon: Layers, labelKey: 'crm.installations.title', label: 'Komponenten', value: installations.length, accent: 'text-brand-600', tab: 'installations', loading: loadingInst },
    { icon: Wrench, labelKey: 'crm.maintenance.objectTitle', label: 'Wartungen', value: maintenance.length, accent: 'text-emerald-600', tab: 'maintenance', loading: loadingMaint },
    { icon: CalendarCheck, labelKey: 'crm.maintenance.lastServiceDate', label: 'Letzter Service', value: fmt(lastService), accent: 'text-sky-600', tab: 'maintenance', loading: loadingMaint, isDate: true },
    { icon: CalendarClock, labelKey: 'crm.maintenance.nextServiceDate', label: 'Nächster Service', value: fmt(nextService), accent: 'text-amber-600', tab: 'maintenance', loading: loadingMaint, isDate: true },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Schnellzugriff */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">{t('crm.sites.quickAccess', 'Schnellzugriff')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => onNavigate?.(s.tab)}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <Icon className={cn('h-5 w-5 shrink-0', s.accent)} />
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{t(s.labelKey, s.label)}</p>
                  {s.loading
                    ? <Skeleton className="mt-1 h-5 w-12" />
                    : <p className={cn('font-semibold text-foreground', s.isDate ? 'text-sm' : 'text-lg tabular-nums')}>{s.value}</p>}
                </div>
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
