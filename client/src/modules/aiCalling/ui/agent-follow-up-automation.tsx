'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BellRing, CalendarClock, CheckCircle2, Download, Loader2, Pause, PhoneCall, PhoneForwarded, Play, Plus, Power, Save, Sparkles, Trash2, UserRound, Workflow } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { downloadBlob } from '@/lib/api/download';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import { followUpCallingApi } from '../services/follow-up-calling-api';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useIntelT, type IntelT } from '../hooks/use-intel-t';
import { useAgentMutations, useAllCallingAgents } from '../hooks/use-calling-agents';
import { useAgentFollowUpQueue, useAgentTemplates, useFollowUpActions, useFollowUpSettings, useFollowUpSummary } from '../hooks/use-follow-up-calling';
import { FOLLOW_UP_TRIGGERS, ROUTING_LEAD_SOURCES, type FollowUpRoutingRule, type AgentFollowUpConfig, type AgentFollowUpItem, type CallingAgent, type FollowUpAutomationState, type Schedule } from '../types/ai-calling-types';
import { CallingWindowFields } from './agent-settings-fields';
import { QuestionEditor } from './question-configuration';
import { AgentField, AgentMetric, AgentTabs, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'] as const;
const ROUTABLE = ['CALLBACK_REQUESTED', 'TEMPORARILY_UNAVAILABLE', 'QUALIFICATION_INCOMPLETE', 'INFORMATION_REQUESTED', 'APPOINTMENT_PENDING', 'QUALIFIED'] as const;
const ACTIVE: FollowUpAutomationState[] = ['queued', 'calling', 'retry_scheduled'];

export const DEFAULT_FOLLOW_UP: Required<Pick<AgentFollowUpConfig, 'enabled' | 'autoCall' | 'manualCall' | 'triggers' | 'objective' | 'instructions' | 'maxRounds' | 'minHoursBetweenRounds' | 'defaultCallbackDelayMinutes' | 'unavailableRetryHours' | 'incompleteRetryHours' | 'informationRetryHours' | 'needsTimeRetryDays' | 'eligibleLeadStatuses' | 'stopLeadStatuses' | 'routes' | 'questions' | 'routingRules'>> & { schedule: Schedule & { timezone: string }; escalation: { userIds: string[]; assignTo: 'owner' | 'first_recipient'; email: boolean } } = {
  enabled: false, autoCall: false, manualCall: true, triggers: ['CALLBACK_REQUESTED'], objective: '', instructions: '',
  maxRounds: 3, minHoursBetweenRounds: 0, defaultCallbackDelayMinutes: 120, unavailableRetryHours: 24, incompleteRetryHours: 24,
  informationRetryHours: 48, needsTimeRetryDays: 3, eligibleLeadStatuses: [], stopLeadStatuses: ['converted', 'unqualified'], routes: {}, questions: [],
  routingRules: [], escalation: { userIds: [], assignTo: 'owner', email: false },
  schedule: { timezone: 'UTC', callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5], maxAttemptsPerLead: 2, retryDelayMinutes: 30, minMinutesBetweenAttempts: 15, maxConcurrency: 1, maxCallsPerDay: 200 },
};

export function followUpDraft(agent: CallingAgent) {
  const f = agent.followUp || {};
  const legacyRecipient = f.escalateToUserId && !f.escalation?.userIds?.length ? [String(f.escalateToUserId)] : null;
  return { ...DEFAULT_FOLLOW_UP, ...f, routes: f.routes || {}, questions: f.questions || [], routingRules: f.routingRules || [],
    escalation: { ...DEFAULT_FOLLOW_UP.escalation, ...(f.escalation || {}), ...(legacyRecipient ? { userIds: legacyRecipient, assignTo: 'first_recipient' as const } : {}) },
    schedule: { ...DEFAULT_FOLLOW_UP.schedule, ...(f.schedule || {}), timezone: f.schedule?.timezone || agent.schedule?.timezone || DEFAULT_FOLLOW_UP.schedule.timezone } };
}

/** State pill colours: logo blues for live work, never purple. */
const STATE_STYLE: Record<string, string> = {
  scheduled: 'bg-sky-500/15 text-sky-300', queued: 'bg-blue-500/15 text-blue-300', calling: 'bg-blue-500/20 text-blue-200',
  retry_scheduled: 'bg-amber-500/15 text-amber-300', paused: 'bg-slate-500/20 text-slate-300', completed: 'bg-emerald-500/15 text-emerald-300',
  no_answer: 'bg-amber-500/15 text-amber-300', busy: 'bg-amber-500/15 text-amber-300', failed: 'bg-rose-500/15 text-rose-300',
  requires_human: 'bg-orange-500/15 text-orange-300', cancelled: 'bg-muted text-muted-foreground', skipped: 'bg-muted text-muted-foreground',
};

export function FollowUpStatePill({ state }: { state: string | null | undefined }) {
  const t = useIntelT();
  if (!state) return null;
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLE[state] || 'bg-muted text-muted-foreground'}`}>
    {state === 'calling' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-cyan-300" />}
    {t(`aiFollowUp.state.${state}`, state.replaceAll('_', ' '))}
  </span>;
}

export const reasonLabel = (t: IntelT, code: string | null | undefined) => (code ? t(`aiFollowUp.reason.${code}`, code.replaceAll('_', ' ').toLowerCase()) : '');

export function AgentFollowUpAutomation({ agent, canManage, onDirty }: { agent: CallingAgent; canManage: boolean; onDirty: (dirty: boolean) => void }) {
  const t = useIntelT();
  const [tab, setTab] = useState('queue');
  return <div className="space-y-5">
    <AutomationStatus agent={agent} onConfigure={() => setTab('configuration')} />
    <FollowUpKpis agentId={agent._id} />
    <AgentTabs label={t('aiFollowUp.sections', 'Follow-up automation sections')} value={tab} onChange={setTab} items={[
      { value: 'queue', label: t('aiFollowUp.tab.queue', 'Follow-up queue') },
      { value: 'configuration', label: t('aiFollowUp.tab.configuration', 'Configuration') },
    ]}>
      {tab === 'queue' && <FollowUpQueue agent={agent} canManage={canManage} />}
      {tab === 'configuration' && <FollowUpConfiguration key={agent.version} agent={agent} canManage={canManage} onDirty={onDirty} />}
    </AgentTabs>
  </div>;
}

/** Organisation switch + this agent's automation, stated honestly in one place. */
function AutomationStatus({ agent, onConfigure }: { agent: CallingAgent; onConfigure: () => void }) {
  const t = useIntelT();
  const settings = useFollowUpSettings();
  const { setAutomation } = useFollowUpActions();
  const { isAdmin, hasPermission } = usePermissions();
  const canAdmin = isAdmin || hasPermission('ai-calling:admin');
  const s = settings.data;
  const cfg = agent.followUp || {};
  const agentOn = Boolean(cfg.enabled);
  const autoOn = agentOn && Boolean(cfg.autoCall);
  const live = Boolean(s?.enabled && autoOn && agent.availability === 'active' && !s?.voicePaused);
  const message = !agentOn ? t('aiFollowUp.status.agentOff', 'Follow-up calling is off for this agent. Callbacks it records become tasks for a person.')
    : !s?.enabled ? t('aiFollowUp.status.orgOff', 'Automatic follow-up calls are off for the organisation. Scheduled AI follow-ups wait; "Call now" still works.')
      : s.voicePaused ? t('aiFollowUp.status.voicePaused', 'AI voice calling is paused (kill switch). No follow-up calls are placed until it is resumed.')
        : !autoOn ? t('aiFollowUp.status.manualOnly', 'This agent places follow-up calls only when someone presses "Call now".')
          : agent.availability !== 'active' ? t('aiFollowUp.status.agentInactive', 'The agent is not active. Due follow-ups wait until it is activated.')
            : t('aiFollowUp.status.live', 'Live: due follow-ups are called automatically within the permitted calling hours.');
  return <section aria-labelledby="fu-status" className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${live ? 'border-cyan-400/25 bg-gradient-to-br from-blue-600/10 via-card to-cyan-500/5' : 'border-border bg-card'}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 id="fu-status" className="flex items-center gap-2 text-sm font-semibold"><PhoneForwarded aria-hidden className="size-4 text-primary" />{t('aiFollowUp.title', 'Follow-up calling automation')}</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground" role="status">{message}</p>
        <dl className="mt-4 flex flex-wrap gap-2 text-xs">
          <StatusChip label={t('aiFollowUp.status.organisation', 'Organisation')} on={Boolean(s?.enabled)} loading={settings.isLoading} />
          <StatusChip label={t('aiFollowUp.status.agent', 'This agent')} on={agentOn} />
          <StatusChip label={t('aiFollowUp.status.automatic', 'Automatic calls')} on={autoOn} />
          <StatusChip label={t('aiFollowUp.status.manual', '"Call now"')} on={agentOn && cfg.manualCall !== false} />
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        {canAdmin && s && !s.forcedOffByEnv && <button type="button" className={s.enabled ? secondaryClass : primaryClass} disabled={setAutomation.isPending}
          onClick={() => setAutomation.mutate({ enabled: !s.enabled })}>{setAutomation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
          {s.enabled ? t('aiFollowUp.status.turnOffOrg', 'Turn off for organisation') : t('aiFollowUp.status.turnOnOrg', 'Turn on for organisation')}</button>}
        {s?.forcedOffByEnv && <span className="text-xs text-muted-foreground">{t('aiFollowUp.status.forcedOff', 'Turned off by a server setting')}</span>}
        <button type="button" className={secondaryClass} onClick={onConfigure}>{t('aiFollowUp.status.configure', 'Configure')}</button>
      </div>
    </div>
  </section>;
}

function StatusChip({ label, on, loading = false }: { label: string; on: boolean; loading?: boolean }) {
  const t = useIntelT();
  return <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${on ? 'border-emerald-400/30 text-emerald-300' : 'border-border text-muted-foreground'}`}>
    <dt className="font-medium">{label}</dt>
    <dd className="flex items-center gap-1">{loading ? <Loader2 className="size-3 animate-spin" /> : <span aria-hidden className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-muted-foreground/50'}`} />}{on ? t('aiFollowUp.on', 'On') : t('aiFollowUp.off', 'Off')}</dd>
  </div>;
}

function FollowUpKpis({ agentId }: { agentId: string }) {
  const t = useIntelT();
  const { data } = useFollowUpSummary(agentId);
  const pct = (n?: number) => (n == null ? '—' : `${Math.round(n * 100)}%`);
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    <AgentMetric label={t('aiFollowUp.kpi.scheduled', 'Scheduled')} value={data?.scheduled ?? '—'} />
    <AgentMetric label={t('aiFollowUp.kpi.inProgress', 'In progress')} value={data?.inProgress ?? '—'} />
    <AgentMetric label={t('aiFollowUp.kpi.completed', 'Completed')} value={data?.completed ?? '—'} />
    <AgentMetric label={t('aiFollowUp.kpi.needsPerson', 'Needs a person')} value={data?.requiresHuman ?? '—'} />
    <AgentMetric label={t('aiFollowUp.kpi.answerRate', 'Answer rate')} value={data?.attempts ? pct(data.answerRate) : '—'} />
    <AgentMetric label={t('aiFollowUp.kpi.qualified', 'Qualified on follow-up')} value={data?.qualified ?? '—'} />
  </div>;
}

function FollowUpQueue({ agent, canManage }: { agent: CallingAgent; canManage: boolean }) {
  const t = useIntelT();
  const [filter, setFilter] = useState<'active' | 'requires_human' | 'completed' | ''>('active');
  const queue = useAgentFollowUpQueue(agent._id, filter || undefined);
  const { callNow, pause, resume } = useFollowUpActions();
  const busy = callNow.isPending || pause.isPending || resume.isPending;
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try { downloadBlob(await followUpCallingApi.exportCsv({ agentId: agent._id }), `ai-follow-ups-${agent.name.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`, 'text/csv;charset=utf-8'); }
    catch (e) { showError(e); } finally { setExporting(false); }
  };
  return <section className={panelClass} aria-labelledby="fu-queue">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 id="fu-queue" className="text-sm font-semibold">{t('aiFollowUp.queue.title', 'Follow-ups handled by this agent')}</h3>
      <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={secondaryClass} disabled={exporting} onClick={() => void exportCsv()}>{exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{t('aiFollowUp.queue.export', 'Export CSV')}</button>
      <select aria-label={t('aiFollowUp.queue.filter', 'Show')} className={`${inputClass} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
        <option value="active">{t('aiFollowUp.queue.active', 'Scheduled and in progress')}</option>
        <option value="requires_human">{t('aiFollowUp.queue.attention', 'Needs a person')}</option>
        <option value="completed">{t('aiFollowUp.queue.completed', 'Completed')}</option>
        <option value="">{t('aiFollowUp.queue.all', 'All')}</option>
      </select>
      </div>
    </div>
    {queue.isLoading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t('aiFollowUp.loading', 'Loading…')}</p>
      : queue.isError ? <p role="alert" className="text-sm text-rose-300">{readableError(queue.error)}</p>
        : !queue.data?.length ? <div className="flex flex-col items-center gap-2 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-sky-400/10 text-primary"><CalendarClock aria-hidden className="size-5" /></span><p className="text-sm font-medium">{t('aiFollowUp.queue.emptyTitle', 'Nothing in this view')}</p><p className="max-w-md text-xs text-muted-foreground">{t('aiFollowUp.queue.emptyHint', 'Follow-ups appear here when a lead asks for a callback or a configured trigger needs another conversation.')}</p></div>
          : <ul className="divide-y divide-border">{queue.data.map((item) => <QueueRow key={item.id} item={item} canManage={canManage} busy={busy}
            onCallNow={() => callNow.mutate(item.id)} onPause={() => pause.mutate(item.id)} onResume={() => resume.mutate(item.id)} />)}</ul>}
  </section>;
}

function QueueRow({ item, canManage, busy, onCallNow, onPause, onResume }: { item: AgentFollowUpItem; canManage: boolean; busy: boolean; onCallNow: () => void; onPause: () => void; onResume: () => void }) {
  const t = useIntelT();
  const a = item.automation;
  const state = a?.state || null;
  const open = item.status === 'open' || item.status === 'snoozed';
  const due = new Date(item.nextDueAt);
  return <li className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <a className="truncate text-sm font-medium hover:text-sky-300" href={`/leads?detail=${item.leadId}`}>{item.lead?.name || t('aiFollowUp.queue.unknownLead', 'Lead')}</a>
        <FollowUpStatePill state={state} />
        {a?.reason && <span className="text-xs text-muted-foreground">{reasonLabel(t, a.reason)}</span>}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarClock aria-hidden className="size-3.5" /><time dateTime={item.nextDueAt}>{due.toLocaleString([], { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>{item.timezone && <span>({item.timezone})</span>}</span>
        <span>{t('aiFollowUp.queue.round', 'Follow-up {round}', { round: a?.round || 1 })}</span>
        {!!a?.attempts && <span>{t('aiFollowUp.queue.launches', '{n} call run(s)', { n: a.attempts })}</span>}
        {a?.timeResolution?.approximate && a.timeResolution.requestedText && <span className="text-amber-300/90">{t('aiFollowUp.queue.requested', 'Lead said: "{text}"', { text: a.timeResolution.requestedText })}</span>}
      </p>
      {a?.call?.summary && <p className="line-clamp-2 max-w-3xl text-xs text-foreground/80">{a.call.summary}</p>}
      {a?.lastError && open && <p className="flex items-center gap-1.5 text-xs text-amber-300"><AlertTriangle aria-hidden className="size-3.5" />{a.lastError}</p>}
    </div>
    {canManage && open && a?.mode === 'ai' && <div className="flex shrink-0 flex-wrap gap-2">
      {state && !ACTIVE.includes(state) && <button type="button" className={secondaryClass} disabled={busy} onClick={onCallNow}><PhoneCall className="size-3.5" />{t('aiFollowUp.action.callNow', 'Call now')}</button>}
      {state === 'paused' ? <button type="button" className={secondaryClass} disabled={busy} onClick={onResume}><Play className="size-3.5" />{t('aiFollowUp.action.resume', 'Resume')}</button>
        : state && (state === 'scheduled' || ACTIVE.includes(state)) && <button type="button" className={secondaryClass} disabled={busy} onClick={onPause}><Pause className="size-3.5" />{t('aiFollowUp.action.pause', 'Pause')}</button>}
    </div>}
  </li>;
}

function FollowUpConfiguration({ agent, canManage, onDirty }: { agent: CallingAgent; canManage: boolean; onDirty: (dirty: boolean) => void }) {
  const t = useIntelT();
  const [draft, setDraft] = useState(() => followUpDraft(agent));
  const [base, setBase] = useState(() => JSON.stringify(followUpDraft(agent)));
  const [error, setError] = useState<string | null>(null);
  const { update } = useAgentMutations();
  const templates = useAgentTemplates();
  const agents = useAllCallingAgents();
  const template = templates.data?.find((x) => x.type === (agent.agentType || 'custom'));
  const others = useMemo(() => (agents.data || []).filter((a) => a._id !== agent._id && a.usage !== 'inbound' && a.availability !== 'archived'), [agents.data, agent._id]);
  const change = (next: typeof draft) => { setDraft(next); onDirty(JSON.stringify(next) !== base); };
  const patch = (p: Partial<typeof draft>) => change({ ...draft, ...p });
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = async () => {
    setError(null);
    try {
      const routes = Object.fromEntries(Object.entries(draft.routes).filter(([, v]) => v));
      const questions = draft.questions.filter((q) => q.fieldKey && q.label && q.text);
      const routingRules = draft.routingRules.filter((r) => r.agentId).map((r) => ({ ...r, when: Object.fromEntries(Object.entries(r.when || {}).filter(([, v]) => Array.isArray(v) && v.length)) }));
      const saved = await update.mutateAsync({ id: agent._id, version: agent.version, followUp: { ...draft, routes, questions, routingRules, escalateToUserId: null } });
      const next = followUpDraft(saved);
      setDraft(next); setBase(JSON.stringify(next)); onDirty(false);
      showSuccess(t('aiFollowUp.saved', 'Follow-up automation saved'));
    } catch (e) { setError(readableError(e)); }
  };
  const num = (key: keyof typeof draft, label: string, min: number, max: number, hint?: string) => <AgentField label={label} hint={hint}>
    <input type="number" className={inputClass} min={min} max={max} value={Number(draft[key] ?? 0)} onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<typeof draft>)} />
  </AgentField>;
  const dirty = JSON.stringify(draft) !== base;

  return <div className="space-y-5">
    <fieldset disabled={!canManage || update.isPending} className="min-w-0 space-y-5 disabled:opacity-60">
      <section className={panelClass} aria-labelledby="fu-activation">
        <h3 id="fu-activation" className="mb-1 flex items-center gap-2 text-sm font-semibold"><Power aria-hidden className="size-4 text-primary" />{t('aiFollowUp.config.activation', 'Activation')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('aiFollowUp.config.activationHint', 'Automatic calls also need the organisation switch. Do-not-contact, consent, quiet hours and contact limits always apply.')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle checked={draft.enabled} onChange={(v) => patch({ enabled: v, ...(v ? {} : { autoCall: false }) })} label={t('aiFollowUp.config.enabled', 'Follow-up calling')} hint={t('aiFollowUp.config.enabledHint', 'This agent may handle follow-ups.')} />
          <Toggle checked={draft.autoCall} disabled={!draft.enabled} onChange={(v) => patch({ autoCall: v })} label={t('aiFollowUp.config.autoCall', 'Automatic calls')} hint={t('aiFollowUp.config.autoCallHint', 'Call automatically when a follow-up is due.')} />
          <Toggle checked={draft.manualCall} disabled={!draft.enabled} onChange={(v) => patch({ manualCall: v })} label={t('aiFollowUp.config.manualCall', 'Manual "Call now"')} hint={t('aiFollowUp.config.manualCallHint', 'People can start a follow-up call at any time.')} />
        </div>
      </section>

      <section className={panelClass} aria-labelledby="fu-triggers">
        <h3 id="fu-triggers" className="mb-1 text-sm font-semibold">{t('aiFollowUp.config.triggers', 'When another call is needed')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('aiFollowUp.config.triggersHint', 'The decision engine uses the validated call result, never a guess. Explicit callback requests are always recorded, even with automation off.')}</p>
        <div className="grid gap-2 sm:grid-cols-2">{FOLLOW_UP_TRIGGERS.map((code) => <label key={code} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-sky-400 ${draft.triggers.includes(code) ? 'border-sky-400/40 bg-blue-500/10' : 'border-border'}`}>
          <input type="checkbox" className="mt-0.5 accent-sky-400" checked={draft.triggers.includes(code)} onChange={() => patch({ triggers: toggleIn(draft.triggers, code) as typeof draft.triggers })} />
          <span><span className="block font-medium">{reasonLabel(t, code)}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t(`aiFollowUp.trigger.${code}.hint`, '')}</span></span>
        </label>)}</div>
      </section>

      <section className={panelClass} aria-labelledby="fu-conversation">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 id="fu-conversation" className="text-sm font-semibold">{t('aiFollowUp.config.conversation', 'Follow-up conversation')}</h3>
          {template?.followUpInstructions && <button type="button" className={secondaryClass} onClick={() => patch({ instructions: template.followUpInstructions })}><Sparkles className="size-3.5" />{t('aiFollowUp.config.useTemplate', 'Use {type} template', { type: t(`aiFollowUp.type.${template.type}`, template.type) })}</button>}
        </div>
        <div className="grid gap-4">
          <AgentField label={t('aiFollowUp.config.objective', 'Follow-up objective')} hint={t('aiFollowUp.config.objectiveHint', 'Empty = the agent\'s call objective.')}><textarea className={`${inputClass} resize-y`} rows={2} maxLength={1000} value={draft.objective} onChange={(e) => patch({ objective: e.target.value })} /></AgentField>
          <AgentField label={t('aiFollowUp.config.instructions', 'Follow-up instructions')} hint={t('aiFollowUp.config.instructionsHint', 'Added to the agent\'s instructions on follow-up calls. The agent also receives the previous conversation, the reason for the call and which answers are still missing.')}><textarea className={`${inputClass} resize-y`} rows={4} maxLength={4000} value={draft.instructions} onChange={(e) => patch({ instructions: e.target.value })} /></AgentField>
        </div>
        <details className="mt-5 rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{t('aiFollowUp.config.questions', 'Follow-up-only questions')} <span className="text-xs text-muted-foreground">({draft.questions.length})</span></summary>
          <p className="my-3 text-xs text-muted-foreground">{t('aiFollowUp.config.questionsHint', 'Asked only on follow-up calls, after the agent\'s questions. Questions already answered on an earlier call are not asked again.')}</p>
          <QuestionEditor questions={draft.questions} onChange={(questions) => patch({ questions })} rules={[]} onImport={(questions) => patch({ questions })} />
        </details>
      </section>

      <section className={panelClass} aria-labelledby="fu-schedule">
        <h3 id="fu-schedule" className="mb-4 text-sm font-semibold">{t('aiFollowUp.config.schedule', 'Calling schedule for follow-ups')}</h3>
        <CallingWindowFields value={draft.schedule} onChange={(schedule) => patch({ schedule: { ...schedule, timezone: schedule.timezone || draft.schedule.timezone || 'UTC' } })} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AgentField label={t('aiFollowUp.config.attempts', 'Attempts per follow-up')}><input type="number" className={inputClass} min={1} max={10} value={draft.schedule.maxAttemptsPerLead ?? 2} onChange={(e) => patch({ schedule: { ...draft.schedule, maxAttemptsPerLead: Number(e.target.value) } })} /></AgentField>
          <AgentField label={t('aiFollowUp.config.retryDelay', 'Retry delay (minutes)')}><input type="number" className={inputClass} min={1} max={10080} value={draft.schedule.retryDelayMinutes ?? 30} onChange={(e) => patch({ schedule: { ...draft.schedule, retryDelayMinutes: Number(e.target.value) } })} /></AgentField>
          <AgentField label={t('aiFollowUp.config.concurrency', 'Concurrent follow-up calls')}><input type="number" className={inputClass} min={1} max={25} value={draft.schedule.maxConcurrency ?? 1} onChange={(e) => patch({ schedule: { ...draft.schedule, maxConcurrency: Number(e.target.value) } })} /></AgentField>
          <AgentField label={t('aiFollowUp.config.callsPerDay', 'Follow-up calls per day')}><input type="number" className={inputClass} min={1} max={100000} value={draft.schedule.maxCallsPerDay ?? 200} onChange={(e) => patch({ schedule: { ...draft.schedule, maxCallsPerDay: Number(e.target.value) } })} /></AgentField>
        </div>
      </section>

      <section className={panelClass} aria-labelledby="fu-timing">
        <h3 id="fu-timing" className="mb-1 text-sm font-semibold">{t('aiFollowUp.config.timing', 'Timing and limits')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('aiFollowUp.config.timingHint', 'A requested time ("in 10 minutes", "tomorrow morning") is always used first, moved into the permitted hours when needed.')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num('defaultCallbackDelayMinutes', t('aiFollowUp.config.defaultDelay', 'Callback without a time (minutes)'), 5, 10080)}
          {num('unavailableRetryHours', t('aiFollowUp.config.unavailable', 'Unreachable → try again after (hours)'), 1, 720)}
          {num('incompleteRetryHours', t('aiFollowUp.config.incomplete', 'Incomplete answers → after (hours)'), 1, 720)}
          {num('informationRetryHours', t('aiFollowUp.config.information', 'Information requested → after (hours)'), 1, 720)}
          {num('needsTimeRetryDays', t('aiFollowUp.config.needsTime', 'Needs time to decide → after (days)'), 1, 60)}
          {num('maxRounds', t('aiFollowUp.config.maxRounds', 'Maximum follow-ups per lead'), 1, 10, t('aiFollowUp.config.maxRoundsHint', 'After that a person takes over.'))}
          {num('minHoursBetweenRounds', t('aiFollowUp.config.minGap', 'Minimum hours between follow-ups'), 0, 720)}
        </div>
      </section>

      <section className={panelClass} aria-labelledby="fu-eligibility">
        <h3 id="fu-eligibility" className="mb-4 text-sm font-semibold">{t('aiFollowUp.config.eligibility', 'Lead eligibility')}</h3>
        <div className="grid gap-5 md:grid-cols-2">
          <StatusChips label={t('aiFollowUp.config.eligibleStatuses', 'Only call leads with status (none selected = any)')} selected={draft.eligibleLeadStatuses} onToggle={(v) => patch({ eligibleLeadStatuses: toggleIn(draft.eligibleLeadStatuses, v) })} />
          <StatusChips label={t('aiFollowUp.config.stopStatuses', 'Stop automation when status becomes')} selected={draft.stopLeadStatuses} onToggle={(v) => patch({ stopLeadStatuses: toggleIn(draft.stopLeadStatuses, v) })} locked={['converted']} />
        </div>
      </section>

      <section className={panelClass} aria-labelledby="fu-routing">
        <h3 id="fu-routing" className="mb-1 flex items-center gap-2 text-sm font-semibold"><Workflow aria-hidden className="size-4 text-primary" />{t('aiFollowUp.config.routing', 'Specialised agents (sequential workflow)')}</h3>
        <p className="mb-4 text-xs text-muted-foreground">{t('aiFollowUp.config.routingHint', 'Hand the next conversation to another agent for a given outcome. The receiving agent must have follow-up calling on; otherwise this agent keeps it. Two agents never call the same lead at the same time.')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ROUTABLE.map((code) => <AgentField key={code} label={code === 'QUALIFIED' ? t('aiFollowUp.config.routeQualified', 'When qualified, hand over to') : reasonLabel(t, code)}>
          <select className={inputClass} value={draft.routes[code] || ''} onChange={(e) => patch({ routes: { ...draft.routes, [code]: e.target.value || null } })}>
            <option value="">{code === 'QUALIFIED' ? t('aiFollowUp.config.noHandoff', 'No hand-over') : t('aiFollowUp.config.thisAgent', 'This agent')}</option>
            {others.map((a) => <option key={a._id} value={a._id} disabled={!a.followUp?.enabled}>{a.name}{a.title ? ` · ${a.title}` : ''}{a.followUp?.enabled ? '' : ` (${t('aiFollowUp.config.followUpOff', 'follow-up off')})`}</option>)}
          </select>
        </AgentField>)}</div>
        <RoutingRulesEditor rules={draft.routingRules} agents={others} onChange={(routingRules) => patch({ routingRules })} />
      </section>

      <EscalationSection value={draft.escalation} onChange={(escalation) => patch({ escalation })} />
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><UserRound aria-hidden className="size-3.5" />{t('aiFollowUp.config.footer', 'Changes apply to follow-ups launched from now on. Calls in progress keep their settings.')}</p>
      <button type="button" className={primaryClass} disabled={!canManage || update.isPending || !dirty} onClick={() => void save()}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : dirty ? <Save className="size-4" /> : <CheckCircle2 className="size-4" />}{t('aiFollowUp.config.save', 'Save follow-up automation')}</button>
    </div>
  </div>;
}

function Toggle({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return <label className={`flex items-start gap-3 rounded-xl border p-3 has-focus-visible:ring-2 has-focus-visible:ring-sky-400 ${disabled ? 'opacity-50' : 'cursor-pointer'} ${checked ? 'border-sky-400/40 bg-blue-500/10' : 'border-border'}`}>
    <input type="checkbox" role="switch" aria-checked={checked} className="mt-0.5 accent-sky-400" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span><span className="block text-sm font-medium text-foreground">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span></span>
  </label>;
}

function StatusChips({ label, selected, onToggle, locked = [] }: { label: string; selected: string[]; onToggle: (v: string) => void; locked?: string[] }) {
  const t = useIntelT();
  return <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend><div className="flex flex-wrap gap-2">{LEAD_STATUSES.map((s) => {
    const isLocked = locked.includes(s);
    const on = isLocked || selected.includes(s);
    return <label key={s} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs has-focus-visible:ring-2 has-focus-visible:ring-sky-400 ${on ? 'border-sky-400/50 bg-blue-500/15 text-primary' : 'border-border text-muted-foreground'} ${isLocked ? 'opacity-70' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only" checked={on} disabled={isLocked} onChange={() => onToggle(s)} />{t(`aiFollowUp.leadStatus.${s}`, s)}
    </label>;
  })}</div></fieldset>;
}

const RULE_OUTCOMES = [...ROUTABLE] as string[];
const listFields = ['languages', 'countries', 'cities', 'businessTypes'] as const;

/** Ordered routing rules on lead/call facts; the first match chooses the agent for the next conversation. */
function RoutingRulesEditor({ rules, agents, onChange }: { rules: FollowUpRoutingRule[]; agents: CallingAgent[]; onChange: (rules: FollowUpRoutingRule[]) => void }) {
  const t = useIntelT();
  const set = (i: number, rule: FollowUpRoutingRule) => onChange(rules.map((r, n) => (n === i ? rule : r)));
  const move = (i: number, by: number) => { const next = [...rules]; const [r] = next.splice(i, 1); next.splice(i + by, 0, r); onChange(next); };
  const toggle = (list: string[] | undefined, v: string) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list || []), v]);
  return <div className="mt-6 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-sm font-semibold">{t('aiFollowUp.rules.title', 'Routing rules')}</h4>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('aiFollowUp.rules.hint', 'Checked from top to bottom; the first rule whose conditions all match picks the agent, before the outcome routes above. Empty conditions match anything.')}</p></div>
      <button type="button" className={secondaryClass} disabled={rules.length >= 25 || !agents.length} onClick={() => onChange([...rules, { id: Date.now().toString(36), name: '', enabled: true, agentId: '', when: {} }])}><Plus className="size-3.5" />{t('aiFollowUp.rules.add', 'Add rule')}</button>
    </div>
    {!agents.length && <p className="text-xs text-muted-foreground">{t('aiFollowUp.rules.noAgents', 'Create another outbound agent with follow-up calling on to route follow-ups to it.')}</p>}
    {rules.map((rule, i) => <fieldset key={rule.id || i} className={`space-y-3 rounded-xl border p-4 ${rule.enabled === false ? 'border-border opacity-70' : 'border-sky-400/25'}`}>
      <legend className="sr-only">{t('aiFollowUp.rules.ruleN', 'Rule {n}', { n: i + 1 })}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <span className="pb-2 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}.</span>
        <div className="min-w-40 flex-1"><AgentField label={t('aiFollowUp.rules.name', 'Rule name')}><input className={inputClass} maxLength={120} value={rule.name || ''} onChange={(e) => set(i, { ...rule, name: e.target.value })} /></AgentField></div>
        <div className="min-w-48 flex-1"><AgentField label={t('aiFollowUp.rules.agent', 'Next conversation by')}>
          <select className={inputClass} value={rule.agentId} onChange={(e) => set(i, { ...rule, agentId: e.target.value })}>
            <option value="" disabled>{t('aiFollowUp.rules.chooseAgent', 'Choose an agent…')}</option>
            {agents.map((a) => <option key={a._id} value={a._id} disabled={!a.followUp?.enabled}>{a.name}{a.followUp?.enabled ? '' : ` (${t('aiFollowUp.config.followUpOff', 'follow-up off')})`}</option>)}
          </select></AgentField></div>
        <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" className="accent-sky-400" checked={rule.enabled !== false} onChange={(e) => set(i, { ...rule, enabled: e.target.checked })} />{t('aiFollowUp.rules.enabled', 'Enabled')}</label>
        <div className="flex gap-1 pb-1">
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t('aiFollowUp.rules.up', 'Move up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></button>
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t('aiFollowUp.rules.down', 'Move down')} disabled={i === rules.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></button>
          <button type="button" className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10" aria-label={t('aiFollowUp.rules.remove', 'Remove rule')} onClick={() => onChange(rules.filter((_, n) => n !== i))}><Trash2 className="size-4" /></button>
        </div>
      </div>
      <ChipGroup label={t('aiFollowUp.rules.outcomes', 'Outcomes (QUALIFIED = hand over after success)')} options={RULE_OUTCOMES} labelOf={(v) => (v === 'QUALIFIED' ? t('aiFollowUp.leadStatus.qualified', 'Qualified') : reasonLabel(t, v))} selected={rule.when.outcomes || []} onToggle={(v) => set(i, { ...rule, when: { ...rule.when, outcomes: toggle(rule.when.outcomes, v) } })} />
      <ChipGroup label={t('aiFollowUp.rules.leadSources', 'Lead source')} options={[...ROUTING_LEAD_SOURCES]} labelOf={(v) => t(`aiFollowUp.leadSource.${v}`, v.replaceAll('_', ' '))} selected={rule.when.leadSources || []} onToggle={(v) => set(i, { ...rule, when: { ...rule.when, leadSources: toggle(rule.when.leadSources, v) } })} />
      <ChipGroup label={t('aiFollowUp.rules.leadStatuses', 'Lead status')} options={[...LEAD_STATUSES]} labelOf={(v) => t(`aiFollowUp.leadStatus.${v}`, v)} selected={rule.when.leadStatuses || []} onToggle={(v) => set(i, { ...rule, when: { ...rule.when, leadStatuses: toggle(rule.when.leadStatuses, v) } })} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{listFields.map((key) => <ListInput key={key} label={t(`aiFollowUp.rules.${key}`, key)} hint={t(`aiFollowUp.rules.${key}Hint`, '')}
        value={rule.when[key] || []} normalize={key === 'countries' ? (v) => v.toUpperCase() : undefined} valid={key === 'countries' ? (v) => /^[A-Z]{2}$/.test(v) : undefined}
        onChange={(values) => set(i, { ...rule, when: { ...rule.when, [key]: values } })} />)}</div>
    </fieldset>)}
  </div>;
}

function ChipGroup({ label, options, selected, onToggle, labelOf }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void; labelOf: (v: string) => string }) {
  return <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend><div className="flex flex-wrap gap-1.5">{options.map((v) => {
    const on = selected.includes(v);
    return <label key={v} className={`flex cursor-pointer items-center rounded-lg border px-2 py-1 text-[11px] has-focus-visible:ring-2 has-focus-visible:ring-sky-400 ${on ? 'border-sky-400/50 bg-blue-500/15 text-primary' : 'border-border text-muted-foreground'}`}>
      <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(v)} />{labelOf(v)}</label>;
  })}</div></fieldset>;
}

/** Comma-separated list, parsed when the field loses focus (typing commas never fights the parser). */
function ListInput({ label, hint, value, onChange, normalize, valid }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void; normalize?: (v: string) => string; valid?: (v: string) => boolean }) {
  const [text, setText] = useState(value.join(', '));
  const commit = () => {
    const parsed = [...new Set(text.split(',').map((x) => (normalize ? normalize(x.trim()) : x.trim())).filter((x) => x && (!valid || valid(x))))];
    setText(parsed.join(', '));
    onChange(parsed);
  };
  return <AgentField label={label} hint={hint || undefined}><input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} /></AgentField>;
}

const userName = (u: { firstName: string; lastName: string; email: string }) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;

/** Escalation: who is notified (in-app on any page + push to the app, optional email) and who takes over. */
function EscalationSection({ value, onChange }: { value: { userIds: string[]; assignTo: 'owner' | 'first_recipient'; email: boolean }; onChange: (v: { userIds: string[]; assignTo: 'owner' | 'first_recipient'; email: boolean }) => void }) {
  const t = useIntelT();
  const users = useWorkspaceUsers();
  const list = users.data || [];
  const [pick, setPick] = useState('');
  return <section className={panelClass} aria-labelledby="fu-escalation">
    <h3 id="fu-escalation" className="mb-1 flex items-center gap-2 text-sm font-semibold"><BellRing aria-hidden className="size-4 text-primary" />{t('aiFollowUp.escalation.title', 'When a person is needed')}</h3>
    <p className="mb-4 text-xs text-muted-foreground">{t('aiFollowUp.escalation.hint', 'Used when a lead asks for a person, a call fails, or the follow-up limit is reached. Recipients get an in-app notification wherever they are in the CRM and a push notification in the mobile app. Without recipients, the organisation default is used, then the follow-up owner.')}</p>
    <div className="flex flex-wrap gap-2">{value.userIds.map((id) => {
      const u = list.find((x) => x.id === id);
      return <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-blue-500/10 px-2.5 py-1 text-xs">{u ? userName(u) : t('aiFollowUp.escalation.unknownUser', 'Unknown user')}
        <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={t('aiFollowUp.escalation.removeUser', 'Remove {name}', { name: u ? userName(u) : id })} onClick={() => onChange({ ...value, userIds: value.userIds.filter((x) => x !== id) })}><Trash2 className="size-3" /></button></span>;
    })}{!value.userIds.length && <span className="text-xs text-muted-foreground">{t('aiFollowUp.escalation.none', 'No recipients: organisation default, then the follow-up owner.')}</span>}</div>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <div className="min-w-56"><AgentField label={t('aiFollowUp.escalation.add', 'Add recipient')}>
        <select className={inputClass} value={pick} onChange={(e) => { const id = e.target.value; setPick(''); if (id && !value.userIds.includes(id)) onChange({ ...value, userIds: [...value.userIds, id] }); }}>
          <option value="">{users.isLoading ? t('aiFollowUp.loading', 'Loading…') : t('aiFollowUp.escalation.choose', 'Choose a person…')}</option>
          {list.filter((u) => !value.userIds.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{userName(u)}</option>)}
        </select></AgentField></div>
      <AgentField label={t('aiFollowUp.escalation.assignTo', 'Who takes over the follow-up')}>
        <select className={inputClass} value={value.assignTo} onChange={(e) => onChange({ ...value, assignTo: e.target.value as 'owner' | 'first_recipient' })}>
          <option value="owner">{t('aiFollowUp.escalation.assignOwner', 'The follow-up owner (recipients are informed)')}</option>
          <option value="first_recipient" disabled={!value.userIds.length}>{t('aiFollowUp.escalation.assignFirst', 'The first recipient')}</option>
        </select></AgentField>
      <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" className="accent-sky-400" checked={value.email} onChange={(e) => onChange({ ...value, email: e.target.checked })} />{t('aiFollowUp.escalation.email', 'Also send an email')}</label>
    </div>
  </section>;
}
