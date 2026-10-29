'use client';

import { useEffect, useState } from 'react';
import { AlarmClock, CheckCircle2, Clock3, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadSla } from '../types/lead-workflow-types';
import { useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { formatLeadDateTime } from './lead-ui-utils';

/**
 * First-response SLA badge with a live countdown. Status is never colour only:
 * every state has an icon and a text label. Nothing is shown for leads without
 * an SLA (no owner / SLA disabled) — never a guessed deadline.
 */

const MINUTE = 60_000;

export function formatCountdown(ms: number, t: TranslateFn): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / (24 * 60 * MINUTE));
  const hours = Math.floor((abs % (24 * 60 * MINUTE)) / (60 * MINUTE));
  const minutes = Math.max(0, Math.floor((abs % (60 * MINUTE)) / MINUTE));
  if (days > 0) return t('leads.sla.durationDays', '{d}d {h}h', { d: days, h: hours });
  if (hours > 0) return t('leads.sla.durationHours', '{h}h {m}m', { h: hours, m: minutes });
  return t('leads.sla.durationMinutes', '{m}m', { m: minutes });
}

/** Re-render every 30 s while a deadline is pending. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function LeadSlaBadge({ sla, size = 'sm', className }: { sla: LeadSla | undefined; size?: 'sm' | 'md'; className?: string }) {
  const { t, locale } = useLanguage();
  const pending = sla?.slaStatus === 'pending' || sla?.slaStatus === 'overdue';
  const now = useNow(Boolean(pending));
  if (!sla || sla.slaStatus === 'none') return null;

  const due = sla.firstResponseDueAt ? Date.parse(sla.firstResponseDueAt) : null;
  const remaining = due != null ? due - now : null;
  const overdue = sla.slaStatus === 'overdue' || (sla.slaStatus === 'pending' && remaining != null && remaining < 0);

  let Icon = Clock3;
  let tone = 'bg-blue-500/10 text-blue-700 ring-blue-500/25 dark:text-blue-300';
  let text: string;
  if (sla.slaStatus === 'met') {
    Icon = CheckCircle2;
    tone = 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400';
    text = t('leads.sla.met', 'Responded in time');
  } else if (sla.slaStatus === 'late') {
    Icon = AlarmClock;
    tone = 'bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300';
    text = t('leads.sla.late', 'Responded late');
  } else if (overdue) {
    Icon = Siren;
    tone = 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300';
    text = remaining != null
      ? t('leads.sla.overdueBy', 'Response overdue {time}', { time: formatCountdown(remaining, t) })
      : t('leads.sla.overdue', 'Response overdue');
  } else {
    text = remaining != null
      ? t('leads.sla.dueIn', 'Respond within {time}', { time: formatCountdown(remaining, t) })
      : t('leads.sla.pending', 'Response pending');
  }
  const title = [
    sla.firstResponseDueAt ? t('leads.sla.dueAt', 'Response due {date}', { date: formatLeadDateTime(sla.firstResponseDueAt, locale) }) : null,
    sla.firstRespondedAt ? t('leads.sla.respondedAt', 'First response {date}', { date: formatLeadDateTime(sla.firstRespondedAt, locale) }) : null,
    sla.escalationLevel > 0 ? t('leads.sla.escalated', 'Escalated (level {level})', { level: sla.escalationLevel }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        tone,
        className,
      )}
      title={title || undefined}
      data-sla-status={overdue ? 'overdue' : sla.slaStatus}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden="true" />
      {text}
      {sla.escalationLevel > 0 && overdue && <span aria-hidden="true">· ↑{sla.escalationLevel}</span>}
    </span>
  );
}
