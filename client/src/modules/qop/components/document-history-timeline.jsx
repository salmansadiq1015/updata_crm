'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { ArrowRight, User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

function fmtDate(dateStr, lang) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function DocumentHistoryTimeline({ history = [], className }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  if (!history.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {de ? 'Keine Verlaufseinträge.' : 'No history entries.'}
      </p>
    );
  }

  return (
    <ol className={cn('relative ml-3 border-l border-border', className)}>
      {history.map((entry, i) => {
        const user = entry.changedBy?.firstName
          ? `${entry.changedBy.firstName} ${entry.changedBy.lastName}`
          : entry.changedBy?.email ?? '—';
        return (
          <li key={i} className="mb-5 ml-4 last:mb-0">
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-border" />
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {entry.fromStatus ?? '—'}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {entry.toStatus}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {user}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtDate(entry.createdAt, language)}
              </span>
            </div>
            {entry.reason && (
              <p className="mt-1 text-xs text-muted-foreground italic">&quot;{entry.reason}&quot;</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
