'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { cn } from '@/lib/utils';
import { FolderKanban, AlertTriangle, Milestone, PlayCircle } from 'lucide-react';

// Lifecycle statuses shown in the per-status breakdown (PROJ-007 AC-1).
const BREAKDOWN_STATUSES = ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'];

export function ProjectStatsRow() {
  const { t, language } = useLanguage();

  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.pm.dashboard.summary(),
    queryFn: () => projectService.getDashboardSummary(),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          label={t('pm.totalProjects', 'Total Projects')}
          value={summary.total ?? 0}
          icon={FolderKanban}
          accent="violet"
        />
        <PremiumStatCard
          label={t('pm.status', 'In Progress')}
          value={summary.byStatus?.IN_PROGRESS ?? 0}
          icon={PlayCircle}
          accent="blue"
        />
        <PremiumStatCard
          label={t('pm.overdueProjects', 'Overdue')}
          value={summary.risk?.overdue ?? 0}
          icon={AlertTriangle}
          accent="amber"
        />
        <PremiumStatCard
          label={t('pm.upcomingMilestones', 'Upcoming Milestones')}
          value={summary.upcomingMilestones ?? 0}
          icon={Milestone}
          accent="emerald"
        />
      </div>

      {/* Per-status breakdown (PROJ-007 AC-1) */}
      <div className="flex flex-wrap items-center gap-2">
        {BREAKDOWN_STATUSES.map((status) => {
          const cfg = PROJECT_STATUS_CONFIG[status];
          return (
            <div
              key={status}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card px-2.5 py-1.5"
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', cfg?.dotColor)} />
              <span className="text-xs text-muted-foreground">
                {language === 'de' ? cfg?.label : cfg?.labelEn}
              </span>
              <span
                className="text-xs font-semibold tabular-nums"
                data-testid={`status-count-${status}`}
              >
                {summary.byStatus?.[status] ?? 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
