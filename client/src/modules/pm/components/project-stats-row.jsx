'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderKanban, AlertTriangle, Milestone } from 'lucide-react';

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

  return (
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
  );
}
