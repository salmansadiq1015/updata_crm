'use client';

import { memo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PM_SCHEDULE_META, translateMetaLabel } from '../../constants/deploy-constants';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useLanguage } from '@/lib/i18n/language-context';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Building2, Flag, ExternalLink } from 'lucide-react';

/**
 * Read-only calendar block for a PM construction-schedule entry surfaced in the
 * Field Deployment calendar (entry.source === 'pm_schedule'). It is owned by PM,
 * so it is NOT editable/draggable here — clicking deep-links to the project.
 * Styled distinctly (dashed border + project color) with a badge marking it as
 * project work.
 */
export const CalendarPmScheduleBlock = memo(function CalendarPmScheduleBlock({
  entry,
  style,
  className,
}) {
  const { t } = useLanguage();
  const meta = PM_SCHEDULE_META[entry.entryType] || PM_SCHEDULE_META.PHASE;
  const metaLabel = translateMetaLabel(t, meta);
  const isMilestone = entry.entryType === 'MILESTONE';
  const Icon = isMilestone ? Flag : Building2;
  const color = meta.calendarColor;
  const href = entry.projectId ? `/projects/${entry.projectId}` : null;

  const content = (
    <span
      className={cn(
        'absolute rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium cursor-pointer',
        'overflow-hidden whitespace-nowrap text-ellipsis text-left flex items-center gap-1',
        'border border-dashed bg-background/80 hover:brightness-105 hover:shadow-md transition-all duration-150',
        className,
      )}
      style={{
        ...style,
        borderColor: color,
        color,
      }}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{entry.title}</span>
    </span>
  );

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {href ? (
          <Link href={href} aria-label={entry.title} style={{ display: 'contents' }}>
            {content}
          </Link>
        ) : (
          content
        )}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="right" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm truncate">{entry.title}</span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-dashed shrink-0"
              style={{ color, borderColor: color }}
            >
              {t('deploy.pmSchedule.badge', 'Projektarbeit')}
            </span>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3 w-3" />
              {metaLabel}
            </div>
            {entry.startDatetime && (
              <div>
                {isMilestone
                  ? format(new Date(entry.startDatetime), 'EEE d. MMM yyyy', { locale: de })
                  : `${format(new Date(entry.startDatetime), 'd. MMM', { locale: de })} – ${entry.endDatetime ? format(new Date(entry.endDatetime), 'd. MMM yyyy', { locale: de }) : ''}`}
              </div>
            )}
            {entry.projectName && (
              <div className="text-muted-foreground/80">
                {entry.projectName}
                {entry.projectNumber ? ` (${entry.projectNumber})` : ''}
              </div>
            )}
          </div>

          {href && (
            <Link
              href={href}
              className="flex items-center gap-1 text-xs font-medium border-t pt-1.5"
              style={{ color }}
            >
              <ExternalLink className="h-3 w-3" />
              {t('deploy.pmSchedule.openProject', 'Projekt öffnen')}
            </Link>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
