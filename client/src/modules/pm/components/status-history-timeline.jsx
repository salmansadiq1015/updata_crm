'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { statusService } from '@/modules/pm/services/status-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { ProjectStatusBadge } from './project-status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { ArrowRight, ShieldAlert, MessageSquare, Clock } from 'lucide-react';

export function StatusHistoryTimeline({ projectId }) {
  const { t, language } = useLanguage();

  const { data: history = [], isLoading } = useQuery({
    queryKey: queryKeys.pm.statusHistory.byProject(projectId),
    queryFn: () => statusService.getStatusHistory(projectId),
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!history.length) {
    return <EmptyState icon={Clock} title={t('pm.statusHistory', 'Status History')} description={language === 'de' ? 'Noch keine Statusaenderungen.' : 'No status changes yet.'} />;
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

      {history.map((entry, idx) => {
        const fromCfg = PROJECT_STATUS_CONFIG[entry.fromStatus];
        const toCfg = PROJECT_STATUS_CONFIG[entry.toStatus];

        return (
          <div key={entry._id || idx} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Dot */}
            <div className={cn(
              'relative z-10 mt-1 h-[10px] w-[10px] rounded-full ring-4 ring-background shrink-0 ml-[14px]',
              toCfg?.dotColor || 'bg-muted-foreground',
            )} />

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {entry.fromStatus && <ProjectStatusBadge status={entry.fromStatus} size="sm" />}
                {entry.fromStatus && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                <ProjectStatusBadge status={entry.toStatus} size="sm" />
                {entry.isOverride && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    <ShieldAlert className="h-3 w-3" /> Override
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateTime(entry.changedAt)}
                </span>
                {entry.changedBy?.firstName && (
                  <span>{entry.changedBy.firstName} {entry.changedBy.lastName}</span>
                )}
              </div>

              {entry.comment && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md p-2 mt-1">
                  <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{entry.comment}</span>
                </div>
              )}

              {entry.isOverride && entry.overrideReason && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-200 dark:border-amber-800 rounded-md p-2 mt-1">
                  <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{entry.overrideReason}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
