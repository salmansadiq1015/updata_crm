'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { formatTaskDuration } from '../utils/task-time-format';
import type { TaskTimeSummary } from '../types/task-time-types';

export function TaskTimeMetrics({ data }: { data: TaskTimeSummary }) {
  const { t } = useLanguage();
  const items = [
    [t('tasks.time.total', 'Total tracked'), formatTaskDuration(data.totalMs)],
    [t('tasks.time.myTime', 'Your time'), formatTaskDuration(data.myTotalMs)],
    [t('tasks.time.averageSession', 'Average session'), formatTaskDuration(data.averageSessionMs)],
    [t('tasks.time.averageTask', 'Average per task'), formatTaskDuration(data.averageTaskMs)],
  ];
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{items.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-border bg-muted/20 p-3">
    <p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight">{value}</p>
  </div>)}</div>;
}

export function TaskEmployeeTimeTable({ data }: { data: TaskTimeSummary }) {
  const { t } = useLanguage();
  if (!data.employees.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('tasks.time.noSessions', 'No tracked sessions yet.')}</p>;
  return <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-left text-xs">
      <caption className="sr-only">{t('tasks.time.employeeBreakdown', 'Time by employee')}</caption>
      <thead className="border-b border-border bg-muted/30 text-muted-foreground"><tr>
        {[t('tasks.time.employee', 'Employee'), t('tasks.time.total', 'Total tracked'), t('tasks.time.sessions', 'Sessions'), t('tasks.time.averageSession', 'Average session'), t('tasks.time.averageTask', 'Average per task')].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-border">{data.employees.map(row => <tr key={row.userId}>
        <td className="px-3 py-3 font-medium">{row.name || t('tasks.time.employee', 'Employee')}{row.activeCount > 0 && <span className="ms-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" title={t('tasks.time.activeSession', 'Active session')} />}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">{formatTaskDuration(row.totalMs)}</td>
        <td className="px-3 py-3 tabular-nums">{row.sessionCount}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">{formatTaskDuration(row.averageSessionMs)}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono tabular-nums">{formatTaskDuration(row.averageTaskMs)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
