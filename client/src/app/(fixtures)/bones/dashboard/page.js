'use client';

import { Skeleton } from 'boneyard-js/react';
import { CalendarCheck, Clock, CheckCircle, XCircle, AlertTriangle, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUMMARY = { total: 42, planned: 12, inProgress: 8, completed: 18, cancelled: 4 };

const CARDS = [
  { key: 'total', label: 'Gesamt', icon: CalendarCheck, color: 'text-primary', bg: 'bg-primary/10', count: SUMMARY.total },
  { key: 'planned', label: 'Geplant', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10', count: SUMMARY.planned },
  { key: 'inProgress', label: 'In Arbeit', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', count: SUMMARY.inProgress },
  { key: 'completed', label: 'Abgeschlossen', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', count: SUMMARY.completed },
  { key: 'cancelled', label: 'Storniert', icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-400/10', count: SUMMARY.cancelled },
];

const UTILIZATION = [
  { name: 'Max Müller', pct: 85 },
  { name: 'Anna Fischer', pct: 72 },
  { name: 'Thomas Weber', pct: 60 },
  { name: 'Sarah Keller', pct: 45 },
  { name: 'Peter Brunner', pct: 30 },
  { name: 'Laura Meier', pct: 92 },
];

const ALERTS = [
  { severity: 'HARD', message: 'Doppelbuchung: Max Müller um 09:00' },
  { severity: 'SOFT', message: 'Fahrzeit: 45 Min. zwischen Einsätzen' },
  { severity: 'SOFT', message: 'Unbestätigter Termin: Kunde Bauer, 14:00' },
];

export default function DashboardFixture() {
  return (
    <Skeleton name="deploy-dashboard" loading={false}>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Übersicht</h1>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CARDS.map(({ key, label, icon: Icon, color, bg, count }) => (
            <div key={key} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <div className={cn('rounded-lg p-1.5', bg)}>
                  <Icon className={cn('h-4 w-4', color)} />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight">{count}</div>
            </div>
          ))}
        </div>

        {/* Chart + Utilization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart placeholder */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Nächste 7 Tage</h3>
            <div className="h-[200px] flex items-end gap-2 px-4">
              {[5, 8, 3, 7, 6, 4, 2].map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-primary rounded-t" style={{ height: `${v * 20}px` }} />
                  <span className="text-[10px] text-muted-foreground">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Utilization */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Auslastung</h3>
            <div className="space-y-2.5">
              {UTILIZATION.map((emp) => (
                <div key={emp.name} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-28 truncate font-medium">{emp.name}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', emp.pct > 90 ? 'bg-red-500' : emp.pct > 70 ? 'bg-amber-500' : 'bg-primary')}
                      style={{ width: `${emp.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right font-medium">{emp.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Warnungen</h3>
          <div className="space-y-2">
            {ALERTS.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-lg border text-xs',
                  alert.severity === 'HARD' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-foreground">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Skeleton>
  );
}
