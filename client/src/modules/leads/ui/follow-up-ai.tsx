'use client';

import { Bot, Hourglass, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOLLOW_UP_ACTIVE_STATES } from '../types/lead-workflow-types';
import type {
  FollowUp, FollowUpAgentOption, FollowUpAutomationState, FollowUpManagement,
} from '../types/lead-workflow-types';
import type { TranslateFn } from './lead-ui-kit';

/**
 * Presentation helpers for AI-managed follow-ups (automation view from
 * server engine/followUpView.js): state pill, reason labels, the compact row
 * badge, the management filter options and which controls are valid per state.
 */

export const AI_STATE_FALLBACK: Record<FollowUpAutomationState, string> = {
  scheduled: 'Scheduled', queued: 'Queued', calling: 'Calling now', retry_scheduled: 'Retry scheduled', paused: 'Paused',
  completed: 'Completed', no_answer: 'No answer', busy: 'Busy', failed: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped',
  requires_human: 'Needs a person',
};

const AI_STATE_TONE: Record<FollowUpAutomationState, string> = {
  scheduled: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  queued: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  calling: 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300',
  retry_scheduled: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  paused: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  no_answer: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  busy: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  requires_human: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  cancelled: 'border-border bg-muted text-muted-foreground',
  skipped: 'border-border bg-muted text-muted-foreground',
};

export const AI_REASON_FALLBACK: Record<string, string> = {
  CALLBACK_REQUESTED: 'Callback requested',
  INTERESTED_NEEDS_MORE_TIME: 'Interested, needs more time',
  INFORMATION_REQUESTED: 'Information requested',
  NO_ANSWER: 'No answer',
  BUSY: 'Line busy',
  TEMPORARILY_UNAVAILABLE: 'Temporarily unavailable',
  APPOINTMENT_PENDING: 'Appointment pending',
  APPOINTMENT_CONFIRMATION_REQUIRED: 'Appointment needs confirmation',
  QUALIFICATION_INCOMPLETE: 'Qualification incomplete',
  HUMAN_FOLLOW_UP_REQUIRED: 'Needs a human follow-up',
  NOT_INTERESTED: 'Not interested',
  DO_NOT_CONTACT: 'Do not contact',
  COMPLETED: 'Completed',
  HANDOFF: 'Handed off',
  MANUAL: 'Scheduled manually',
};

/** Known automation-history reason codes (followUpCalling.service.js / followUpDecision.js). */
export const AI_HISTORY_REASON_FALLBACK: Record<string, string> = {
  assigned_to_ai: 'Assigned to the AI agent',
  agent_changed: 'AI agent changed',
  assigned_to_human: 'Handed to a person',
  manual_call: 'Call started manually',
  dialled: 'Call placed',
  dial_failed: 'The call could not be placed',
  dial_rejected: 'The call was rejected before dialling',
  paused_by_user: 'Paused by a user',
  resumed_by_user: 'Resumed by a user',
  cancelled_by_user: 'Cancelled by a user',
  completed_by_user: 'Completed by a user',
  attempts_exhausted: 'All call attempts used',
  campaign_cancelled: 'Call campaign cancelled',
  campaign_missing: 'Call campaign missing',
  call_failed: 'Call failed',
  call_outcome_uncertain: 'Call outcome uncertain',
  lead_unavailable: 'Lead no longer available',
  reconciled: 'State reconciled',
  max_rounds_reached: 'Maximum follow-up rounds reached',
  qualified_handoff: 'Qualified — handed to a person',
  follow_up_already_active: 'Another follow-up is already active',
  lead_status_not_eligible: 'Lead status not eligible',
  lead_status_protected: 'Lead status protected',
  lead_status_stop: 'Lead status stops follow-ups',
  campaign_retry_policy: 'Retried by the call campaign',
};

const humanize = (code: string) => code.replace(/_/g, ' ').toLowerCase();

export const aiStateLabel = (state: string | null, t: TranslateFn) =>
  state ? t(`leads.followUps.ai.state.${state}`, AI_STATE_FALLBACK[state as FollowUpAutomationState] ?? humanize(state)) : '';

export const aiReasonLabel = (code: string | null, t: TranslateFn) =>
  code ? t(`leads.followUps.ai.reason.${code}`, AI_REASON_FALLBACK[code] ?? humanize(code)) : '';

/** History reasons are codes; unknown codes fall back to the readable code (server data, not UI copy). */
export const aiHistoryReasonLabel = (code: string | null, t: TranslateFn) => {
  if (!code) return '';
  if (AI_REASON_FALLBACK[code]) return aiReasonLabel(code, t);
  return t(`leads.followUps.ai.history.${code}`, AI_HISTORY_REASON_FALLBACK[code] ?? humanize(code));
};

export function AiStatePill({ state, t, className }: { state: FollowUpAutomationState | null; t: TranslateFn; className?: string }) {
  if (!state) return null;
  const live = state === 'calling' || state === 'queued';
  return (
    <span data-state={state} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', AI_STATE_TONE[state], className)}>
      {live && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
      )}
      {aiStateLabel(state, t)}
    </span>
  );
}

/** Compact AI badge for an inbox row: agent, state, reason, round / attempts, requested words. */
export function FollowUpAiSummary({ item, t }: { item: FollowUp; t: TranslateFn }) {
  const a = item.automation;
  if (!a) return null;
  const ai = a.mode === 'ai';
  const agentName = a.agent?.name || (a.agentId ? t('leads.followUps.ai.agentUnavailable', 'AI agent unavailable') : null);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {ai ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-gradient-to-r from-blue-600/15 via-blue-500/10 to-cyan-500/15 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-500/20 dark:text-sky-300">
          <Bot className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{agentName ? t('leads.followUps.ai.badge', 'AI · {agent}', { agent: agentName }) : t('leads.followUps.ai.badgeNoAgent', 'AI follow-up')}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          <UserRound className="h-3 w-3" aria-hidden="true" />{t('leads.followUps.ai.handedToHuman', 'Handed to a person')}
        </span>
      )}
      <AiStatePill state={a.state} t={t} />
      {a.reason && <span className="text-muted-foreground">{aiReasonLabel(a.reason, t)}</span>}
      {ai && <span className="text-muted-foreground tabular-nums">{t('leads.followUps.ai.roundAttempts', 'Round {round} · {attempts} attempts', { round: a.round, attempts: a.attempts })}</span>}
      {a.timeResolution?.approximate && a.timeResolution.requestedText && (
        <span className="inline-flex items-center gap-1 text-muted-foreground" dir="auto">
          <Hourglass className="h-3 w-3" aria-hidden="true" />
          {t('leads.followUps.ai.approximate', 'Approximate time — lead said “{text}”', { text: a.timeResolution.requestedText })}
        </span>
      )}
    </div>
  );
}

export const MANAGEMENT_OPTIONS: { value: FollowUpManagement | ''; fallback: string }[] = [
  { value: '', fallback: 'All follow-ups' },
  { value: 'ai', fallback: 'AI-managed' },
  { value: 'human', fallback: 'Human-managed' },
  { value: 'ai_scheduled', fallback: 'Scheduled AI calls' },
  { value: 'ai_active', fallback: 'In progress' },
  { value: 'ai_completed', fallback: 'Completed calls' },
  { value: 'ai_failed', fallback: 'Failed calls' },
  { value: 'attention', fallback: 'Requires attention' },
];

/** Which AI controls are valid for this follow-up right now (mirrors followUpCalling.service.js guards). */
export function aiControlsFor(item: FollowUp, agent?: FollowUpAgentOption | null) {
  const a = item.automation;
  const open = item.status === 'open' || item.status === 'snoozed';
  const ai = a?.mode === 'ai' && Boolean(a.agentId);
  const active = Boolean(a?.state && FOLLOW_UP_ACTIVE_STATES.includes(a.state));
  const manualCallOff = agent ? !agent.followUp.manualCall : false;
  return {
    open,
    ai,
    active,
    callNow: open && ai && !active,
    manualCallOff,
    reschedule: open && !active,
    changeAgent: open && !active,
    editInstructions: open && ai && !active,
    pause: open && ai && (a?.state === 'scheduled' || active),
    resume: open && a?.state === 'paused',
    assignHuman: open && ai,
    complete: open,
    cancel: open,
  };
}

/**
 * Native agent picker: only agents with follow-up calling enabled are
 * selectable; the others are listed disabled with the reason.
 */
export function AgentSelect({ id, agents, value, onChange, t, describedBy }: {
  id: string; agents: FollowUpAgentOption[]; value: string; onChange: (value: string) => void; t: TranslateFn; describedBy?: string;
}) {
  return (
    <select id={id} aria-describedby={describedBy} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{t('leads.followUps.ai.chooseAgent', 'Choose an AI agent…')}</option>
      {agents.map((agent) => {
        const off = !agent.followUp.enabled;
        const suffix = off ? t('leads.followUps.ai.agentFollowUpOff', 'follow-up calling off')
          : agent.availability && agent.availability !== 'active' ? t(`leads.followUps.ai.availability.${agent.availability}`, agent.availability) : '';
        return <option key={agent.id} value={agent.id} disabled={off}>{suffix ? `${agent.name} (${suffix})` : agent.name}</option>;
      })}
    </select>
  );
}

/** Explains why the picker has no usable agent and where to enable follow-up calling. */
export function AgentPickerHint({ id, agents, t }: { id: string; agents: FollowUpAgentOption[]; t: TranslateFn }) {
  const usable = agents.filter((agent) => agent.followUp.enabled);
  const selectable = usable.length > 0;
  return (
    <p id={id} className={cn('text-xs', selectable ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300')}>
      {selectable
        ? t('leads.followUps.ai.agentHint', 'Only agents with follow-up calling turned on can take follow-ups. Paused or draft agents keep the call waiting until they are activated.')
        : agents.length
          ? t('leads.followUps.ai.noEnabledAgents', 'None of your AI agents has follow-up calling turned on. Enable it in AI Calling → your agent → Follow-up Automation.')
          : t('leads.followUps.ai.noAgents', 'You have no outbound AI agents yet. Create one in AI Calling and turn on Follow-up Automation.')}
    </p>
  );
}
