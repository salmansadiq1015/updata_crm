'use client';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { CampaignStatus, EndOutcome, RunStatus, WorkflowStatus } from '../../types/workflow-types';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'live';
const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300',
  info: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300',
  success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
  danger: 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
  live: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300',
};
const DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400', info: 'bg-sky-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500', live: 'bg-cyan-500',
};

const WORKFLOW_TONE: Record<WorkflowStatus, Tone> = { draft: 'neutral', published: 'success', paused: 'warning', archived: 'neutral' };
const RUN_TONE: Record<RunStatus, Tone> = {
  pending: 'neutral', queued: 'info', running: 'live', waiting: 'info', paused: 'warning', completed: 'success', failed: 'danger', cancelled: 'neutral', skipped: 'warning',
};
const CAMPAIGN_TONE: Record<CampaignStatus, Tone> = { draft: 'neutral', running: 'live', paused: 'warning', stopped: 'neutral', completed: 'success' };
const OUTCOME_TONE: Record<EndOutcome, Tone> = {
  qualified: 'success', converted: 'success', interested: 'success', not_qualified: 'neutral', not_interested: 'neutral', unreachable: 'warning', callback_scheduled: 'info',
  follow_up_required: 'info', opted_out: 'warning', completed: 'neutral', failed: 'danger', stopped: 'neutral',
};

function Pill({ tone, label, pulse = false, className }: { tone: Tone; label: string; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      <span className="relative flex size-1.5">
        {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', DOT[tone])} />}
        <span className={cn('relative inline-flex size-1.5 rounded-full', DOT[tone])} />
      </span>
      {label}
    </span>
  );
}

export function WorkflowStatusBadge({ status, className }: { status: WorkflowStatus; className?: string }) {
  const { t } = useLanguage();
  return <Pill tone={WORKFLOW_TONE[status] || 'neutral'} label={t(`workflow.status.${status}`, status)} pulse={status === 'published'} className={className} />;
}
export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  const { t } = useLanguage();
  return <Pill tone={RUN_TONE[status] || 'neutral'} label={t(`workflow.runStatus.${status}`, status)} pulse={status === 'running' || status === 'waiting'} className={className} />;
}
export function CampaignStatusBadge({ status, className }: { status: CampaignStatus; className?: string }) {
  const { t } = useLanguage();
  return <Pill tone={CAMPAIGN_TONE[status] || 'neutral'} label={t(`workflow.campaignStatus.${status}`, status)} pulse={status === 'running'} className={className} />;
}
export function OutcomeBadge({ outcome, className }: { outcome: EndOutcome | null | undefined; className?: string }) {
  const { t } = useLanguage();
  if (!outcome) return null;
  return <Pill tone={OUTCOME_TONE[outcome] || 'neutral'} label={t(`workflow.outcome.${outcome}`, outcome)} className={className} />;
}
