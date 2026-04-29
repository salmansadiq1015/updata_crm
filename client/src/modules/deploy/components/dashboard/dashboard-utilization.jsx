'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { BarChart3 } from 'lucide-react';

function UtilizationBar({ name, percentage }) {
  const capped = Math.min(100, Math.max(0, percentage || 0));
  const color = capped > 90 ? 'bg-red-500' : capped > 70 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-foreground w-28 truncate font-medium">{name}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${capped}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right font-medium">{Math.round(capped)}%</span>
    </div>
  );
}

export function DashboardUtilization({ data }) {
  const { t } = useLanguage();
  const employees = Array.isArray(data) ? data : data?.data || [];

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        {t('deploy.dashboard.utilization', 'Auslastung')}
      </h3>
      {employees.length === 0 ? (
        <DeployEmptyState
          icon={BarChart3}
          title={t('deploy.common.noData', 'Keine Daten')}
          description={t('deploy.empty.utilizationDesc', 'Auslastungsdaten werden angezeigt, sobald Einsätze geplant sind.')}
          compact
          className="py-6"
        />
      ) : (
        <div className="space-y-2.5 max-h-[250px] overflow-y-auto">
          {employees.map((emp) => (
            <UtilizationBar
              key={emp.employeeId}
              name={emp.employeeName || emp.employeeId}
              percentage={emp.percentage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
