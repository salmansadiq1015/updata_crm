'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ASSIGNMENT_TYPE_META, PRIORITY_META, PM_SCHEDULE_META } from '../../constants/deploy-constants';
import { AssignmentTypeBadge } from '../shared/assignment-type-badge';
import { AssignmentStatusBadge } from '../shared/assignment-status-badge';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { Clock, CalendarDays, Building2, Flag, ExternalLink } from 'lucide-react';

export function CalendarMobileList({ employees, onAssignmentClick }) {
  const { t } = useLanguage();

  const allAssignments = employees.flatMap((emp) => [
    ...(emp.assignments || []).map((a) => ({ ...a, employeeName: emp.employeeName })),
    ...(emp.pmScheduleEntries || []).map((e) => ({ ...e, employeeName: emp.employeeName })),
  ]);

  const sorted = allAssignments.sort(
    (a, b) => new Date(a.startDatetime) - new Date(b.startDatetime)
  );

  if (!sorted.length) {
    return (
      <DeployEmptyState
        icon={CalendarDays}
        title={t('deploy.empty.calendarTitle', 'Noch keine Einsätze')}
        description={t('deploy.empty.calendarDesc', 'Erstellen Sie einen neuen Einsatz, um Ihren Kalender zu füllen.')}
      />
    );
  }

  return (
    <div className="space-y-1 px-2">
      {sorted.map((a, index) => {
        const dateStr = format(new Date(a.startDatetime), 'EEEE, d. MMMM', { locale: de });
        const previousDateStr = index > 0
          ? format(new Date(sorted[index - 1].startDatetime), 'EEEE, d. MMMM', { locale: de })
          : null;
        const showDate = dateStr !== previousDateStr;

        // Read-only PM schedule entry (project work) — links to the project.
        if (a.source === 'pm_schedule') {
          const pmMeta = PM_SCHEDULE_META[a.entryType] || PM_SCHEDULE_META.PHASE;
          const PmIcon = a.entryType === 'MILESTONE' ? Flag : Building2;
          const href = a.projectId ? `/projects/${a.projectId}` : '#';
          return (
            <div key={`pm-${a._id}`}>
              {showDate && (
                <div className="text-xs font-semibold text-muted-foreground pt-3 pb-1 px-1 sticky top-0 bg-background z-10">
                  {dateStr}
                </div>
              )}
              <Link
                href={href}
                className="w-full text-left rounded-lg border border-dashed p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors"
                style={{ borderColor: pmMeta.calendarColor }}
              >
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: pmMeta.calendarColor }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{a.title}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <PmIcon className="h-3 w-3" />
                    {pmMeta.label}
                    <span className="mx-1">·</span>
                    <span>{a.employeeName}</span>
                  </div>
                  <div className="mt-1.5">
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-dashed"
                      style={{ color: pmMeta.calendarColor, borderColor: pmMeta.calendarColor }}
                    >
                      {t('deploy.pmSchedule.badge', 'Projektarbeit')}
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          );
        }

        const typeMeta = ASSIGNMENT_TYPE_META[a.assignmentType] || ASSIGNMENT_TYPE_META.OTHER;
        const priorityMeta = PRIORITY_META[a.priority];
        const isUrgent = a.priority === 'URGENT';

        return (
          <div key={a._id}>
            {showDate && (
              <div className="text-xs font-semibold text-muted-foreground pt-3 pb-1 px-1 sticky top-0 bg-background z-10">
                {dateStr}
              </div>
            )}
            <button
              onClick={() => onAssignmentClick?.(a)}
              className={cn(
                'w-full text-left rounded-lg border p-3 flex items-start gap-3',
                'hover:bg-muted/50 transition-colors',
                isUrgent && 'border-red-300 dark:border-red-700'
              )}
            >
              <div
                className="w-1 self-stretch rounded-full shrink-0"
                style={{ backgroundColor: typeMeta.calendarColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {a.title || typeMeta.label}
                  </span>
                  {priorityMeta?.icon && (
                    <priorityMeta.icon className={cn('h-3.5 w-3.5 shrink-0', priorityMeta.color)} />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {format(new Date(a.startDatetime), 'HH:mm')}–{format(new Date(a.endDatetime), 'HH:mm')}
                  <span className="mx-1">·</span>
                  <span>{a.employeeName}</span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <AssignmentTypeBadge type={a.assignmentType} />
                  <AssignmentStatusBadge status={a.status} />
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
