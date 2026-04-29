'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { AlertTriangle, CalendarOff, Bell } from 'lucide-react';

export function DashboardAlertsList({ data }) {
  const { t } = useLanguage();
  const alerts = Array.isArray(data) ? data : data?.data || [];

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        {t('deploy.dashboard.alerts', 'Warnungen')}
      </h3>
      {alerts.length === 0 ? (
        <DeployEmptyState
          icon={Bell}
          title={t('deploy.dashboard.noAlerts', 'Keine Warnungen')}
          description={t('deploy.empty.alertsDesc', 'Es liegen keine Warnungen oder unbestätigten Termine vor.')}
          compact
          className="py-6"
        />
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {alerts.map((alert, i) => {
            const isConflict = alert.type === 'CONFLICT';
            return (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-lg border text-xs',
                  alert.severity === 'HARD' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
                )}
              >
                {isConflict
                  ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  : <CalendarOff className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                }
                <span className="text-foreground">{alert.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
