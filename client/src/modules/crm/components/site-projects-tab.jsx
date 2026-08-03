'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, ArrowRight, CalendarClock } from 'lucide-react';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';

const fmt = (v) => (v ? new Date(v).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : null);

/** Projects linked to this object (site) via siteId. */
export function SiteProjectsTab({ siteId }) {
  const { t, language } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ['pm', 'projects', 'site', siteId],
    queryFn: () => projectService.getProjects({ siteId, limit: 100, sortOrder: 'desc' }),
    enabled: !!siteId,
  });

  const projects = data?.data || data?.items || (Array.isArray(data) ? data : []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!projects.length) {
    return (
      <EmptyState
        icon={FolderKanban}
        title={t('crm.sites.projectsEmpty', 'Keine Projekte')}
        description={t('crm.sites.projectsEmptyDesc', 'Diesem Objekt sind noch keine Projekte zugeordnet.')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const cfg = PROJECT_STATUS_CONFIG[p.status] || PROJECT_STATUS_CONFIG.DRAFT;
        const dates = [fmt(p.plannedStartDate), fmt(p.plannedEndDate)].filter(Boolean).join(' – ');
        return (
          <Link key={p._id} href={`/projects/${p._id}`}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                  <FolderKanban className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', cfg.bgColor, cfg.textColor, cfg.borderColor)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotColor)} />
                      {language === 'en' ? cfg.labelEn : cfg.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {p.projectNumber && <span className="font-mono">{p.projectNumber}</span>}
                    {dates && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {dates}</span>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
