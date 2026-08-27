'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban, AlertTriangle, Milestone } from 'lucide-react';

/** The project lifecycle, in the order a job actually moves through it. */
const LIFECYCLE_STATUSES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'PLANNING', label: 'Planning' },
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'ON_HOLD', label: 'On Hold' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'INVOICED', label: 'Invoiced' },
];

export function ProjectStatsRow() {
  const { t } = useLanguage();

  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.pm.dashboard.summary(),
    queryFn: () => projectService.getDashboardSummary(),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const byStatus = summary.byStatus || {};

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <PremiumStatCard
        label={t('pm.totalProjects', 'Total Projects')}
        value={summary.total ?? 0}
        icon={FolderKanban}
        accent="violet"
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

      {/* The status distribution the dashboard is specified to show
          (PROJ-007 AC-1). Every lifecycle status appears, including the ones
          at zero: a status missing from the row reads as "none in that state",
          which is exactly what it means — and leaving it out entirely makes
          the reader wonder whether it was counted at all. */}
      <div className="flex flex-wrap gap-2">
        {LIFECYCLE_STATUSES.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-1.5"
          >
            <span className="text-xs text-muted-foreground">{t(`pm.status.${key}`, label)}</span>
            <span
              data-testid={`status-count-${key}`}
              className="text-sm font-semibold tabular-nums text-foreground"
            >
              {byStatus[key] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
