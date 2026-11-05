'use client';

import { useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useTaskTimeReport } from '../hooks/use-task-timer';
import { TaskTimeMetrics, TaskEmployeeTimeTable } from './task-time-summary';

export function TaskTimeReport() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const canViewTeam = hasPermission('time-tracking:read');
  const query = useTaskTimeReport(days, canViewTeam ? scope : 'mine');
  return <section data-testid="task-time-report" className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-theme-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />{t('tasks.time.report', 'Task time report')}</h2><div className="flex flex-wrap items-center gap-2">
      {canViewTeam && <Select value={scope} onValueChange={value => setScope(value as 'mine' | 'team')}><SelectTrigger aria-label={t('tasks.time.scope', 'Report scope')} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mine">{t('tasks.time.myTime', 'Your time')}</SelectItem><SelectItem value="team">{t('tasks.time.team', 'Team')}</SelectItem></SelectContent></Select>}
      <Select value={String(days)} onValueChange={value => setDays(Number(value))}><SelectTrigger aria-label={t('tasks.time.range', 'Time range')} className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent>{[7, 30, 90, 0].map(value => <SelectItem key={value} value={String(value)}>{value ? t('tasks.time.days', 'Last {count} days', { count: value }) : t('tasks.time.allTime', 'All time')}</SelectItem>)}</SelectContent></Select>
      <Button size="icon-sm" variant="outline" aria-label={t('common.refresh', 'Refresh')} disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>
    </div></div>
    <p className="text-xs leading-5 text-muted-foreground">{t('tasks.time.reportHelp', 'Sessions started in the selected period. Average session uses stopped sessions; average per task uses distinct tasks. Pauses are excluded. Up to 100 employees are shown, ordered by tracked time.')}</p>
    {query.data && <><TaskTimeMetrics data={query.data} /><TaskEmployeeTimeTable data={query.data} /></>}
    {query.isLoading && <p className="text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</p>}
    {query.isError && <p role="status" className="text-xs text-warning">{t('tasks.time.historyError', 'Time history could not be loaded. Please retry.')}</p>}
  </section>;
}
