'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/modules/pm/services/project-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { SCHEDULE_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Milestone, CalendarClock } from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 Tage', labelEn: '7 Days' },
  { value: 14, label: '14 Tage', labelEn: '14 Days' },
  { value: 30, label: '30 Tage', labelEn: '30 Days' },
];

export function MilestonesWidget() {
  const { language } = useLanguage();
  const [days, setDays] = useState(14);

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: queryKeys.pm.dashboard.milestones(days),
    queryFn: () => projectService.getDashboardMilestones(days),
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {language === 'de' ? 'Anstehende Meilensteine' : 'Upcoming Milestones'}
          </CardTitle>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium transition-colors',
                  days === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted text-muted-foreground',
                )}
                onClick={() => setDays(opt.value)}
              >
                {language === 'de' ? opt.label : opt.labelEn}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {language === 'de'
              ? `Keine Meilensteine in den nächsten ${days} Tagen`
              : `No milestones in the next ${days} days`}
          </p>
        ) : (
          <div className="space-y-1.5">
            {milestones.slice(0, 8).map((m) => {
              const statusCfg = SCHEDULE_STATUS_CONFIG[m.status] || SCHEDULE_STATUS_CONFIG.PLANNED;
              const date = m.milestoneDate || m.endDate;
              return (
                <Link
                  key={m._id}
                  href={`/projects/${m.projectId?._id || m.projectId}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Milestone className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                      {m.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {m.projectId?.name || m.projectId?.projectNumber || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {date ? formatDate(date) : '—'}
                    </span>
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', statusCfg.bgColor, statusCfg.textColor)}>
                      {language === 'de' ? statusCfg.label : statusCfg.labelEn}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
