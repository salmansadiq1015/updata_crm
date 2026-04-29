'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { CalendarCheck, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_FILTER_MAP = {
  total: null,
  planned: 'PLANNED',
  inProgress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

const CARDS = [
  { key: 'total', labelKey: 'deploy.summary.total', fallback: 'Gesamt', icon: CalendarCheck, color: 'text-primary', bg: 'bg-primary/10' },
  { key: 'planned', labelKey: 'deploy.summary.planned', fallback: 'Geplant', icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10' },
  { key: 'inProgress', labelKey: 'deploy.summary.inProgress', fallback: 'In Arbeit', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'completed', labelKey: 'deploy.summary.completed', fallback: 'Abgeschlossen', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { key: 'cancelled', labelKey: 'deploy.summary.cancelled', fallback: 'Storniert', icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-400/10' },
];

export function DashboardSummaryCards({ summary }) {
  const { t } = useLanguage();
  const counts = summary?.assignmentsToday || {};

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARDS.map(({ key, labelKey, fallback, icon: Icon, color, bg }) => {
        const statusFilter = STATUS_FILTER_MAP[key];
        const href = statusFilter
          ? `/scheduling/calendar?status=${statusFilter}`
          : '/scheduling/calendar';

        return (
          <Link key={key} href={href} className="rounded-xl border bg-card p-4 space-y-2 hover:border-primary/50 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t(labelKey, fallback)}</span>
              <div className={cn('rounded-lg p-1.5', bg)}>
                <Icon className={cn('h-4 w-4', color)} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {counts[key] ?? 0}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
