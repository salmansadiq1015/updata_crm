'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Bot, CalendarClock, Check, FileText, History, Loader2, Pause, PencilLine, PhoneCall, Play, UserRound, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { DetailDrawer } from '@/shared/components/detail-drawer';
import { useFollowUp, useFollowUpAgents, useFollowUpAiAction } from '../hooks/use-lead-workflow';
import type {
  FollowUp, FollowUpAgentOption, FollowUpAiAction, FollowUpAutomationSettings, FollowUpAutomationState,
} from '../types/lead-workflow-types';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Textarea, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { LeadCallLifecycle } from './lead-call-lifecycle';
import { CallTranscriptDialog } from './call-transcript-dialog';
import {
  AgentPickerHint, AgentSelect, AiStatePill, aiControlsFor, aiHistoryReasonLabel, aiReasonLabel,
} from './follow-up-ai';
import { formatInZone } from './follow-up-format';

/**
 * Follow-up detail panel: lead, who works it (AI agent or person), reason,
 * previous interaction, instructions, schedule, attempts, live call state,
 * qualification, next action and the automation history — with only the
 * controls that are valid for the current state. Every control calls a real
 * endpoint; lifecycle actions (done / reschedule / reassign / cancel) reuse
 * the inbox action dialog.
 */

export type LifecycleKind = 'complete' | 'snooze' | 'reassign' | 'cancel';

type AgentDialogMode = 'assign' | 'change' | 'instructions';

const LIVE_CALL_STATES = ['initiating', 'ringing', 'in_progress'];
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Section({ title, icon: Icon, children, action }: { title: string; icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border/60 py-4 first:pt-0 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function formatDuration(seconds: number, t: TranslateFn) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? t('leads.followUps.ai.durationMinutes', '{m} min {s} s', { m, s }) : t('leads.followUps.ai.durationSeconds', '{s} s', { s });
}

/** Plain-language next step, honest about automation being off / the agent not calling automatically. */
export function nextActionText(fu: FollowUp, { settings, agent, locale, tz, t }: {
  settings: FollowUpAutomationSettings | null; agent: FollowUpAgentOption | null; locale: string; tz: string; t: TranslateFn;
}): string {
  const a = fu.automation;
  if (fu.status === 'done' || fu.status === 'cancelled') return t('leads.followUps.ai.next.closed', 'Closed — nothing further is planned.');
  if (!a || a.mode !== 'ai') {
    if (a?.state === 'requires_human') return t('leads.followUps.ai.next.requires_human', 'A person needs to take over this follow-up.');
    return t('leads.followUps.ai.next.human', '{owner} follows up — due {date}.', { owner: fu.owner.name ?? t('leads.assignee.unknown', 'Unknown user'), date: formatInZone(fu.nextDueAt, locale, tz) });
  }
  switch (a.state) {
    case 'scheduled': {
      if (settings?.voicePaused) return t('leads.followUps.ai.next.voicePaused', 'AI voice calling is paused, so no AI call is placed until it is resumed.');
      if (settings && !settings.enabled) return t('leads.followUps.ai.next.waitsOrgOff', 'Automatic follow-up calls are off: this call waits until an admin turns automation on, or until you use “Call now”.');
      if (agent && !agent.followUp.autoCall) return t('leads.followUps.ai.next.waitsAgentManual', 'This agent does not call automatically: use “Call now” when you are ready.');
      const when = a.notBefore && fu.nextDueAt && Date.parse(a.notBefore) > Date.parse(fu.nextDueAt) ? a.notBefore : fu.nextDueAt;
      return t('leads.followUps.ai.next.scheduled', 'The AI agent calls at {date} (your time), within its calling window.', { date: formatInZone(when, locale, tz) });
    }
    case 'queued': return t('leads.followUps.ai.next.queued', 'The call is queued and starts shortly.');
    case 'calling': return t('leads.followUps.ai.next.calling', 'The AI agent is on the call now.');
    case 'retry_scheduled': return t('leads.followUps.ai.next.retry_scheduled', 'The call campaign redials automatically.');
    case 'paused': return t('leads.followUps.ai.next.paused', 'Paused — resume to let the AI agent call again.');
    case 'requires_human': return t('leads.followUps.ai.next.requires_human', 'A person needs to take over this follow-up.');
    default: return t('leads.followUps.ai.next.finished', 'No further AI call is planned. Mark the follow-up done or assign it again.');
  }
}

function AgentDialog({ item, mode, agents, agentsLoading, agentsError, onClose }: {
  item: FollowUp; mode: AgentDialogMode; agents: FollowUpAgentOption[]; agentsLoading: boolean; agentsError: boolean; onClose: () => void;
}) {
  const { t } = useLanguage();
  const action = useFollowUpAiAction();
  const currentAgent = item.automation?.mode === 'ai' ? item.automation.agentId : null;
  const [picked, setPicked] = useState<string | null>(null);
  // Default to the current agent while it can still take follow-ups (agents load asynchronously).
  const fallback = currentAgent && (mode === 'instructions' || agents.some((x) => x.id === currentAgent && x.followUp.enabled)) ? currentAgent : '';
  const agentId = mode === 'instructions' ? currentAgent ?? '' : picked ?? fallback;
  const [instructions, setInstructions] = useState(item.automation?.instructions ?? '');
  const titles: Record<AgentDialogMode, string> = {
    assign: t('leads.followUps.ai.assignTitle', 'Hand this follow-up to an AI agent'),
    change: t('leads.followUps.ai.changeTitle', 'Change AI agent'),
    instructions: t('leads.followUps.ai.instructionsTitle', 'Edit follow-up instructions'),
  };
  const submit = () => {
    if (!agentId || action.isPending) return;
    action.mutate({ id: item.id, action: 'assign-agent', body: { agentId, instructions: instructions.trim() } }, {
      onSuccess: () => { showSuccess(t('leads.followUps.saved', 'Follow-up updated')); onClose(); },
      onError: (err) => showError(err),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !action.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>{item.lead.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {mode !== 'instructions' && (
            <div className="space-y-2">
              <Label htmlFor="fu-ai-agent">{t('leads.followUps.ai.agent', 'AI agent')}</Label>
              {agentsLoading ? <p role="status" className="text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
                : agentsError ? <p role="alert" className="text-sm text-destructive">{t('leads.followUps.ai.agentsError', 'AI agents could not be loaded. Close and try again.')}</p>
                  : (
                    <>
                      <AgentSelect id="fu-ai-agent" agents={agents} value={agentId} onChange={setPicked} t={t} describedBy="fu-ai-agent-hint" />
                      <AgentPickerHint id="fu-ai-agent-hint" agents={agents} t={t} />
                    </>
                  )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="fu-ai-instructions">{t('leads.followUps.ai.instructions', 'Instructions for this follow-up (optional)')}</Label>
            <Textarea id="fu-ai-instructions" rows={4} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} dir="auto"
              placeholder={t('leads.followUps.ai.instructionsPlaceholder', 'For example: confirm the appointment date and ask whether the budget is approved.')} />
            <p className="text-xs text-muted-foreground">{t('leads.followUps.ai.instructionsHint', 'Added to the agent’s follow-up instructions for this follow-up only.')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={action.isPending} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} disabled={!agentId || action.isPending} className="gap-1.5">
            {action.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {mode === 'instructions' ? t('leads.followUps.ai.saveInstructions', 'Save instructions') : t('leads.followUps.ai.assignConfirm', 'Assign agent')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignHumanDialog({ item, users, onClose }: { item: FollowUp; users: LeadUser[]; onClose: () => void }) {
  const { t } = useLanguage();
  const action = useFollowUpAiAction();
  const [owner, setOwner] = useState(item.owner.id || '');
  const submit = () => {
    if (action.isPending) return;
    action.mutate({ id: item.id, action: 'assign-human', body: { ownerId: owner || null } }, {
      onSuccess: () => { showSuccess(t('leads.followUps.ai.assignedHuman', 'Follow-up handed to a person')); onClose(); },
      onError: (err) => showError(err),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !action.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('leads.followUps.ai.assignHumanTitle', 'Assign to a person')}</DialogTitle>
          <DialogDescription>{t('leads.followUps.ai.assignHumanDescription', 'The AI agent stops working on this follow-up; a queued call is cancelled.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fu-ai-human">{t('leads.followUps.owner', 'Owner')}</Label>
          <select id="fu-ai-human" className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
            {item.owner.id && !users.some((u) => u.id === item.owner.id) && <option value={item.owner.id}>{item.owner.name ?? item.owner.id}</option>}
            {users.map((u) => <option key={u.id} value={u.id}>{getUserDisplayName(u) || u.id}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={action.isPending} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} disabled={action.isPending} className="gap-1.5">
            {action.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t('leads.followUps.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpDetailDrawer({
  item, open, onOpenChange, locale, tz, users, canManage, canAiRead, canAiWrite, isMine, isSupervisor, settings, onLifecycle,
}: {
  item: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  tz: string;
  users: LeadUser[];
  /** Lead lifecycle actions (lead:write + owner / creator / supervisor). */
  canManage: boolean;
  canAiRead: boolean;
  canAiWrite: boolean;
  /** The viewer owns or created the follow-up. */
  isMine: boolean;
  isSupervisor: boolean;
  settings: FollowUpAutomationSettings | null;
  onLifecycle: (kind: LifecycleKind, item: FollowUp) => void;
}) {
  const { t } = useLanguage();
  const detail = useFollowUp(open ? item.id : null, item);
  const fu = detail.data ?? item;
  const agentsQuery = useFollowUpAgents(open && canAiRead);
  const agents = agentsQuery.data ?? [];
  const aiAction = useFollowUpAiAction();
  const [agentDialog, setAgentDialog] = useState<AgentDialogMode | null>(null);
  const [humanDialog, setHumanDialog] = useState(false);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const a = fu.automation;
  const agent = a?.agentId ? agents.find((x) => x.id === a.agentId) ?? null : null;
  const controls = aiControlsFor(fu, agent);
  // Server rule: follow-up owner, creator, the agent's owner (the agent list is per owner) or a supervisor.
  const canAi = canAiWrite && (isMine || isSupervisor || Boolean(agent));
  const showOwnZone = fu.timezone && fu.timezone !== tz;
  const voicePaused = Boolean(settings?.voicePaused);

  const run = (input: FollowUpAiAction, success: string) => {
    if (aiAction.isPending) return;
    aiAction.mutate(input, { onSuccess: () => showSuccess(success), onError: (err) => showError(err) });
  };
  const busy = (name: FollowUpAiAction['action']) => aiAction.isPending && aiAction.variables?.action === name;
  const spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  const callNowBlocked = controls.manualCallOff
    ? t('leads.followUps.ai.manualCallOff', 'Manual follow-up calls are turned off for this agent.')
    : voicePaused ? t('leads.followUps.ai.voicePausedShort', 'AI voice calling is paused.') : null;

  const footer = (
    <div className="space-y-2">
      {canAi && controls.callNow && callNowBlocked && <p id="fu-call-now-blocked" className="text-xs text-amber-700 dark:text-amber-300">{callNowBlocked}</p>}
      <div className="flex flex-wrap gap-2">
        {canAi && controls.callNow && (
          <Button size="sm" className="gap-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white hover:opacity-95" disabled={aiAction.isPending || Boolean(callNowBlocked)}
            aria-describedby={callNowBlocked ? 'fu-call-now-blocked' : undefined}
            onClick={() => run({ id: fu.id, action: 'call-now' }, t('leads.followUps.ai.callStarted', 'Follow-up call started'))}>
            {busy('call-now') ? spinner : <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />}
            {t('leads.followUps.ai.callNow', 'Call now')}
          </Button>
        )}
        {canAi && controls.pause && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={aiAction.isPending} onClick={() => run({ id: fu.id, action: 'pause' }, t('leads.followUps.ai.pausedToast', 'Automation paused'))}>
            {busy('pause') ? spinner : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
            {t('leads.followUps.ai.pause', 'Pause automation')}
          </Button>
        )}
        {canAi && controls.resume && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={aiAction.isPending} onClick={() => run({ id: fu.id, action: 'resume' }, t('leads.followUps.ai.resumedToast', 'Automation resumed'))}>
            {busy('resume') ? spinner : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {t('leads.followUps.ai.resume', 'Resume automation')}
          </Button>
        )}
        {canAi && canAiRead && controls.changeAgent && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={aiAction.isPending} onClick={() => setAgentDialog(controls.ai ? 'change' : 'assign')}>
            <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            {controls.ai ? t('leads.followUps.ai.changeAgent', 'Change agent') : t('leads.followUps.ai.assignAgent', 'Assign AI agent')}
          </Button>
        )}
        {canManage && controls.reschedule && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onLifecycle('snooze', fu)}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.ai.reschedule', 'Reschedule')}
          </Button>
        )}
        {canManage && controls.complete && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onLifecycle('complete', fu)}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.ai.markCompleted', 'Mark completed')}
          </Button>
        )}
        {canAi && controls.assignHuman && (
          <Button size="sm" variant="outline" className="gap-1.5" disabled={aiAction.isPending} onClick={() => setHumanDialog(true)}>
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.ai.assignHuman', 'Assign to human')}
          </Button>
        )}
        {canManage && controls.open && !controls.ai && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onLifecycle('reassign', fu)}>
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.reassign', 'Reassign')}
          </Button>
        )}
        {canManage && controls.cancel && (
          <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => onLifecycle('cancel', fu)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.ai.cancelFollowUp', 'Cancel follow-up')}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5" asChild>
          <Link href={`/leads?detail=${fu.leadId}`}><History className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.ai.viewHistory', 'View complete history')}</Link>
        </Button>
      </div>
    </div>
  );

  const history = [...(a?.history ?? [])].reverse();
  const callLive = Boolean(a?.call?.state && LIVE_CALL_STATES.includes(a.call.state));

  return (
    <>
      <DetailDrawer open={open} onOpenChange={onOpenChange} enableEditMode={false} size="md"
        title={fu.lead.name || t('leads.followUps.ai.detailSubtitle', 'Follow-up details')}
        subtitle={t('leads.followUps.ai.detailSubtitle', 'Follow-up details')}
        footer={footer}>
        <div aria-busy={detail.isFetching}>
          <Section title={t('leads.followUps.ai.lead', 'Lead')} icon={UserRound}>
            <dl className="space-y-1.5">
              <Field label={t('leads.followUps.ai.leadName', 'Name')}><Link href={`/leads?detail=${fu.leadId}`} className="font-medium hover:underline">{fu.lead.name}</Link></Field>
              {fu.lead.leadNumber && <Field label={t('leads.followUps.ai.leadNumber', 'Lead number')}><span className="font-mono text-xs">{fu.lead.leadNumber}</span></Field>}
              {fu.lead.phone && <Field label={t('leads.followUps.ai.phone', 'Phone')}><span dir="ltr">{fu.lead.phone}</span></Field>}
              {fu.lead.email && <Field label={t('leads.followUps.ai.email', 'Email')}>{fu.lead.email}</Field>}
              {fu.lead.status && <Field label={t('leads.followUps.ai.status', 'Status')}><span className="capitalize">{t(`leads.status.${fu.lead.status}`, fu.lead.status.replace(/_/g, ' '))}</span></Field>}
            </dl>
          </Section>

          <Section title={a?.mode === 'ai' ? t('leads.followUps.ai.assignedAgent', 'Assigned AI agent') : t('leads.followUps.ai.assignedOwner', 'Assigned to')} icon={a?.mode === 'ai' ? Bot : UserRound}>
            {a?.mode === 'ai' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 text-white" aria-hidden="true"><Bot className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.agent?.name || t('leads.followUps.ai.agentUnavailable', 'AI agent unavailable')}</p>
                  {a.agent?.title && <p className="text-xs text-muted-foreground">{a.agent.title}</p>}
                </div>
                <AiStatePill state={a.state} t={t} />
                {a.agent?.availability && a.agent.availability !== 'active' && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{t(`leads.followUps.ai.availability.${a.agent.availability}`, a.agent.availability)}</span>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{fu.owner.name ?? t('leads.assignee.unknown', 'Unknown user')}</span>
                {a?.state && <AiStatePill state={a.state} t={t} />}
              </div>
            )}
          </Section>

          <Section title={t('leads.followUps.ai.reasonTitle', 'Follow-up reason')} icon={FileText}>
            {a?.reason && <p className="text-sm font-medium">{aiReasonLabel(a.reason, t)}</p>}
            {fu.note && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{fu.note}</p>}
            {!a?.reason && !fu.note && <p className="text-sm text-muted-foreground">{t('leads.followUps.ai.notRecorded', 'Not recorded')}</p>}
            {a?.timeResolution?.requestedText && (
              <p className="text-xs text-muted-foreground" dir="auto">
                {a.timeResolution.approximate
                  ? t('leads.followUps.ai.approximate', 'Approximate time — lead said “{text}”', { text: a.timeResolution.requestedText })
                  : t('leads.history.requestedTime', 'Requested: “{text}”', { text: a.timeResolution.requestedText })}
              </p>
            )}
            {a?.timeResolution?.shiftedFrom && <p className="text-xs text-muted-foreground">{t('leads.followUps.ai.shiftedFrom', 'Moved into the calling window from {date}', { date: formatInZone(a.timeResolution.shiftedFrom, locale, tz) })}</p>}
          </Section>

          <Section title={t('leads.followUps.ai.schedule', 'Schedule')} icon={CalendarClock}>
            <dl className="space-y-1.5">
              <Field label={t('leads.followUps.ai.due', 'Due')}>
                <span className="font-medium">{formatInZone(fu.nextDueAt, locale, tz)}</span>
                <span className="text-muted-foreground"> · {t('leads.followUps.yourTime', 'your time')}</span>
                {showOwnZone && <span className="block text-xs text-muted-foreground">{formatInZone(fu.nextDueAt, locale, fu.timezone)} ({fu.timezone})</span>}
                {!fu.timezone && <span className="block text-xs text-muted-foreground">{t('leads.followUps.tzUnknown', 'planned timezone not recorded')}</span>}
              </Field>
              {a?.notBefore && <Field label={t('leads.followUps.ai.notBefore', 'Not before')}>{formatInZone(a.notBefore, locale, tz)}</Field>}
              {a?.mode === 'ai' && <Field label={t('leads.followUps.ai.attempts', 'Call attempts')}><span className="tabular-nums">{t('leads.followUps.ai.roundAttempts', 'Round {round} · {attempts} attempts', { round: a.round, attempts: a.attempts })}</span></Field>}
            </dl>
          </Section>

          {a && (
            <Section title={t('leads.followUps.ai.previousInteraction', 'Previous interaction')} icon={PhoneCall}
              action={a.callRecordId ? <Button size="xs" variant="ghost" onClick={() => setTranscriptId(a.callRecordId)}>{t('leads.followUps.ai.openTranscript', 'Open transcript')}</Button> : undefined}>
              {a.call ? (
                <dl className="space-y-1.5">
                  {a.call.state && <Field label={t('leads.followUps.ai.liveState', 'Call state')}>
                    <span className={cn('inline-flex items-center gap-1.5', callLive && 'font-medium text-blue-700 dark:text-sky-300')}>
                      {callLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none" aria-hidden="true" />}
                      {t(`leads.followUps.ai.callState.${a.call.state}`, a.call.state.replace(/_/g, ' '))}
                    </span>
                  </Field>}
                  {a.call.disposition && <Field label={t('leads.followUps.ai.disposition', 'Outcome')}>{t(`leads.followUps.ai.disposition.${a.call.disposition}`, a.call.disposition.replace(/_/g, ' '))}</Field>}
                  {a.call.qualification && <Field label={t('leads.followUps.ai.qualification', 'Qualification')}>{t(`leads.followUps.ai.qualification.${a.call.qualification}`, a.call.qualification.replace(/_/g, ' '))}</Field>}
                  {a.call.durationSeconds > 0 && <Field label={t('leads.followUps.ai.duration', 'Duration')}>{formatDuration(a.call.durationSeconds, t)}</Field>}
                  {a.call.endedAt && <Field label={t('leads.followUps.ai.endedAt', 'Ended')}>{formatInZone(a.call.endedAt, locale, tz)}</Field>}
                  {a.call.summary && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm [overflow-wrap:anywhere]" dir="auto">{a.call.summary}</div>}
                </dl>
              ) : <p className="text-sm text-muted-foreground">{t('leads.followUps.ai.noCallYet', 'No follow-up call has been placed yet.')}</p>}
              {a.previousCallId && (
                <Button size="xs" variant="link" className="px-0" onClick={() => setTranscriptId(a.previousCallId)}>{t('leads.followUps.ai.previousCall', 'Open the call that led to this follow-up')}</Button>
              )}
            </Section>
          )}

          {fu.lead.latestCall && (
            <Section title={t('leads.followUps.ai.collected', 'Collected answers & qualification')}>
              <LeadCallLifecycle value={fu.lead.latestCall} />
            </Section>
          )}

          {(a?.mode === 'ai' || a?.instructions) && (
            <Section title={t('leads.followUps.ai.instructionsSection', 'Follow-up instructions')} icon={PencilLine}
              action={canAi && controls.editInstructions ? <Button size="xs" variant="ghost" className="gap-1" onClick={() => setAgentDialog('instructions')}><PencilLine className="h-3 w-3" aria-hidden="true" />{t('leads.followUps.ai.editInstructions', 'Edit instructions')}</Button> : undefined}>
              {a?.instructions ? <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]" dir="auto">{a.instructions}</p>
                : <p className="text-sm text-muted-foreground">{t('leads.followUps.ai.noInstructions', 'No extra instructions — the agent uses its own follow-up instructions.')}</p>}
            </Section>
          )}

          <Section title={t('leads.followUps.ai.nextAction', 'Next action')}>
            <p className="text-sm">{nextActionText(fu, { settings, agent, locale, tz, t })}</p>
          </Section>

          {a?.lastError && (
            <Section title={t('leads.followUps.ai.lastError', 'Last error')} icon={AlertTriangle}>
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">{a.lastError}</p>
            </Section>
          )}

          {history.length > 0 && (
            <Section title={t('leads.followUps.ai.historyTitle', 'Automation history')} icon={History}>
              <ol className="space-y-3 border-s border-border ps-4">
                {history.map((h, index) => (
                  <li key={`${h.at}-${h.state}-${index}`} className="relative">
                    <span className="absolute -start-[21px] top-1.5 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-card" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-2">
                      <AiStatePill state={h.state as FollowUpAutomationState} t={t} />
                      <time className="text-xs text-muted-foreground" dateTime={h.at ?? undefined}>{formatInZone(h.at, locale, tz)}</time>
                    </div>
                    {h.reason && <p className="mt-0.5 text-xs text-muted-foreground">{aiHistoryReasonLabel(h.reason, t)}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>
      </DetailDrawer>
      {agentDialog && <AgentDialog key={agentDialog} item={fu} mode={agentDialog} agents={agents} agentsLoading={agentsQuery.isLoading} agentsError={agentsQuery.isError} onClose={() => setAgentDialog(null)} />}
      {humanDialog && <AssignHumanDialog item={fu} users={users} onClose={() => setHumanDialog(false)} />}
      {transcriptId && <CallTranscriptDialog leadId={fu.leadId} callId={transcriptId} onOpenChange={(value) => { if (!value) setTranscriptId(null); }} />}
    </>
  );
}
