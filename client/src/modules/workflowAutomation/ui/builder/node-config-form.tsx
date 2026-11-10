'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { API_URL } from '@/lib/api/config';
import { useAgentOptions, useDirectoryUsers, useMessageTemplates } from '../../hooks/use-lookups';
import { ConditionBuilder, type ConditionGroup } from './condition-builder';
import {
  ChipToggleGroup, Field, NumberField, SectionTitle, SelectField, SwitchField, TextField, VariableChips, type Option,
} from './form-controls';
import type { NodeConfig, ValidationIssue, WorkflowCatalog } from '../../types/workflow-types';

type Cfg = Record<string, any>;

interface Props {
  workflowId: string;
  nodeId: string;
  type: string;
  config: NodeConfig;
  onChange: (patch: NodeConfig) => void;
  issues: ValidationIssue[];
  catalog: WorkflowCatalog;
  nodeOptions: Array<{ id: string; label: string }>;
}

const MESSAGE_VARS = ['firstName', 'lastName', 'fullName', 'businessName', 'city', 'assignedUserName', 'companyName', 'senderName', 'callSummary', 'link'];
const INTERNAL_VARS = ['lead.name', 'lead.phone', 'lead.email', 'call.disposition', 'call.summary', 'analysis.qualification', 'workflow.name'];
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const LEAD_SOURCES = ['extension', 'google_places', 'manual', 'widget', 'import', 'incoming_call'];

export function NodeConfigForm({ workflowId, type, config, onChange, issues, catalog, nodeOptions }: Props) {
  const { t } = useLanguage();
  const c = config as Cfg;
  const set = (patch: Cfg) => onChange({ ...c, ...patch });
  const f = (field: string) => issues.filter((i) => i.field === field || i.field?.startsWith(`${field}.`));
  const { agents } = useAgentOptions();
  const channel = type.startsWith('msg.') ? (type.slice(4) as 'sms' | 'email' | 'whatsapp') : null;
  const { data: templates = [] } = useMessageTemplates(channel);
  const needsUsers = ['crm.assign', 'notify.user', 'task.create', 'crm.follow_up'].includes(type);
  const { data: users = [] } = useDirectoryUsers('');

  const statusOptions: Option[] = catalog.leadStatuses.map((s) => ({ value: s, label: t(`leads.status.${s}`, s) }));
  const userOptions: Option[] = needsUsers ? users.map((u) => ({ value: u._id, label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id })) : [];
  const agentOptions = (filter: (a: any) => boolean = () => true): Option[] => agents.filter(filter).map((a: any) => ({
    value: a._id, label: a.name, hint: a.availability !== 'active' ? t(`workflowBuilder.agentState.${a.availability}`, a.availability) : undefined,
  }));
  const dayOptions: Option[] = DAYS.map((d) => ({ value: String(d), label: t(`workflowBuilder.day.${d}`, String(d)) }));
  const append = (key: string) => (token: string) => set({ [key]: `${c[key] || ''}${c[key] && !String(c[key]).endsWith(' ') ? ' ' : ''}${token}` });

  switch (type) {
    // ------------------------------------------------------------------ triggers
    case 'trigger.manual':
      return <Hint>{t('workflowBuilder.help.manual', 'Leads enter this workflow when you start a workflow campaign (Automation → Campaigns) or test it with a sample lead.')}</Hint>;
    case 'trigger.lead_created':
    case 'trigger.leads_imported':
      return <Hint>{t(`workflowBuilder.help.${type === 'trigger.lead_created' ? 'leadCreated' : 'leadsImported'}`, 'Starts automatically for each new lead once the workflow is published.')}</Hint>;
    case 'trigger.lead_updated':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.toStatus', 'When the status becomes')} value={c.toStatus} onChange={(v) => set({ toStatus: v })} options={statusOptions} allowNone noneLabel={t('workflowBuilder.form.anyStatus', 'Any status')} issues={f('toStatus')} />
          <ChipToggleGroup label={t('workflowBuilder.form.fields', 'Only when these fields change')} help={t('workflowBuilder.help.fields', 'Leave empty to react to any change. Changes made by this workflow never re-trigger it.')}
            value={c.fields || []} onChange={(v) => set({ fields: v })} issues={f('fields')}
            options={['status', 'assignedTo', 'tags', 'pipelineStage', 'email', 'phone', 'notes'].map((x) => ({ value: x, label: t(`workflowBuilder.leadField.${x}`, x) }))} />
        </div>
      );
    case 'trigger.call_completed':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.callOutcome', 'Call result')} value={c.outcome || 'any'} onChange={(v) => set({ outcome: v || 'any' })} issues={f('outcome')}
            options={catalog.callOutcomeFilters.map((o) => ({ value: o, label: t(`workflowBuilder.callOutcome.${o}`, o) }))} />
          <SelectField label={t('workflowBuilder.form.agentFilter', 'Only calls by this agent')} value={c.agentId} onChange={(v) => set({ agentId: v })} options={agentOptions()} allowNone noneLabel={t('workflowBuilder.form.anyAgent', 'Any agent')} issues={f('agentId')} />
          <Hint>{t('workflowBuilder.help.callCompleted', 'Fires once per processed call. Calls placed by this same workflow never re-trigger it.')}</Hint>
        </div>
      );
    case 'trigger.inbound_call':
      return <SelectField label={t('workflowBuilder.form.inboundOutcome', 'Incoming call result')} value={c.outcome || 'any'} onChange={(v) => set({ outcome: v || 'any' })} issues={f('outcome')}
        options={['any', 'handled', 'missed', 'qualified'].map((o) => ({ value: o, label: t(`workflowBuilder.inboundOutcome.${o}`, o) }))} />;
    case 'trigger.message_received':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.channel', 'Channel')} value={c.channel || 'any'} onChange={(v) => set({ channel: v || 'any' })} issues={f('channel')}
            options={['any', 'sms', 'whatsapp', 'email'].map((o) => ({ value: o, label: t(`workflowBuilder.channel.${o}`, o) }))} />
          <TextField label={t('workflowBuilder.form.keyword', 'Message contains (optional)')} value={c.keyword || ''} onChange={(v) => set({ keyword: v })} maxLength={60} issues={f('keyword')}
            help={t('workflowBuilder.help.keyword', 'Opt-out replies (STOP) never start a workflow; they stop running ones.')} />
        </div>
      );
    case 'trigger.message_status':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.channel', 'Channel')} value={c.channel || 'any'} onChange={(v) => set({ channel: v || 'any' })} options={['any', 'sms', 'whatsapp', 'email'].map((o) => ({ value: o, label: t(`workflowBuilder.channel.${o}`, o) }))} />
          <SelectField label={t('workflowBuilder.form.messageStatus', 'Delivery status')} value={c.status || 'delivered'} onChange={(v) => set({ status: v || 'delivered' })} issues={f('status')}
            options={['delivered', 'read', 'opened', 'failed'].map((o) => ({ value: o, label: t(`workflowBuilder.messageStatus.${o}`, o) }))} />
          {c.status === 'opened' && <Hint>{t('workflowBuilder.help.opened', 'Email opens are detected with a tracking pixel where the mail app loads images. Some apps preload images (e.g. Apple Mail), so treat opens as a signal, not proof.')}</Hint>}
        </div>
      );
    case 'trigger.link_clicked':
      return <Hint>{t('workflowBuilder.help.linkClicked', 'Starts when a lead genuinely clicks a tracked link sent by any workflow. Security scanners and link previews are ignored.')}</Hint>;
    case 'trigger.webhook':
      return <WebhookInfo workflowId={workflowId} token={c.token} />;
    case 'trigger.schedule':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField type="time" label={t('workflowBuilder.form.time', 'Time')} value={c.time || '09:00'} onChange={(v) => set({ time: v })} issues={f('time')} />
            <NumberField label={t('workflowBuilder.form.limit', 'Max. leads per run')} value={c.limit ?? 100} min={1} max={catalog.limits.maxScheduleEnrollments} onChange={(v) => set({ limit: v })} issues={f('limit')} />
          </div>
          <ChipToggleGroup label={t('workflowBuilder.form.days', 'Days')} options={dayOptions} value={(c.days || []).map(String)} onChange={(v) => set({ days: v.map(Number) })} issues={f('days')} />
          <TextField label={t('workflowBuilder.form.timezone', 'Time zone')} value={c.timezone || 'Europe/Zurich'} onChange={(v) => set({ timezone: v })} issues={f('timezone')} placeholder="Europe/Zurich" />
          <SectionTitle>{t('workflowBuilder.form.segment', 'Lead segment')}</SectionTitle>
          <ChipToggleGroup label={t('workflowBuilder.form.statuses', 'Statuses')} options={statusOptions} value={c.segment?.statuses || []} onChange={(v) => set({ segment: { ...c.segment, statuses: v } })} issues={f('segment')} />
          <ChipToggleGroup label={t('workflowBuilder.form.sources', 'Sources')} options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`workflowBuilder.leadSource.${s}`, s) }))} value={c.segment?.sources || []} onChange={(v) => set({ segment: { ...c.segment, sources: v } })} />
          <TagsInput label={t('workflowBuilder.form.tags', 'Tags')} value={c.segment?.tags || []} onChange={(v) => set({ segment: { ...c.segment, tags: v } })} />
        </div>
      );

    // ------------------------------------------------------------------ AI
    case 'ai.call':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.agent', 'AI agent')} value={c.agentId} onChange={(v) => set({ agentId: v })} issues={f('agentId')} placeholder={t('workflowBuilder.form.chooseAgent', 'Choose an AI agent')}
            options={agentOptions((a) => a.usage !== 'inbound')} help={t('workflowBuilder.help.agent', 'The agent’s questions, language, voice and calling hours are used unchanged.')} />
          <Link href={c.agentId ? `/ai-calling?agent=${c.agentId}` : '/ai-calling'} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {t('workflowBuilder.form.manageAgents', 'Manage AI agents')}<ExternalLink className="size-3" />
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('workflowBuilder.form.maxAttempts', 'Max. attempts')} value={c.maxAttempts ?? 2} min={1} max={10} onChange={(v) => set({ maxAttempts: v })} issues={f('maxAttempts')} />
            <NumberField label={t('workflowBuilder.form.retryDelay', 'Retry after')} suffix={t('workflowBuilder.unit.minutesShort', 'min')} value={c.retryDelayMinutes ?? 60} min={5} onChange={(v) => set({ retryDelayMinutes: v })} issues={f('retryDelayMinutes')} />
          </div>
          <NumberField label={t('workflowBuilder.form.timeout', 'Give up after')} suffix={t('workflowBuilder.unit.hoursShort', 'h')} value={c.timeoutHours ?? 72} min={1} onChange={(v) => set({ timeoutHours: v })} issues={f('timeoutHours')}
            help={t('workflowBuilder.help.callTimeout', 'If no call result arrives in time the pending call is cancelled and the “Failed” branch continues.')} />
          <Hint>{t('workflowBuilder.help.callBranches', 'Answered: a person was on the line. No answer: all attempts unanswered/busy/voicemail. Not allowed: consent, do-not-call, quiet hours or missing phone.')}</Hint>
        </div>
      );
    case 'ai.analyze':
      return (
        <div className="space-y-4">
          <NumberField label={t('workflowBuilder.form.waitIntelligence', 'Wait for call intelligence up to')} suffix={t('workflowBuilder.unit.minutesShort', 'min')} value={c.waitForIntelligenceMinutes ?? 10} min={0} max={60}
            onChange={(v) => set({ waitForIntelligenceMinutes: v })} issues={f('waitForIntelligenceMinutes')} />
          <Hint>{t('workflowBuilder.help.analyze', 'Uses the validated answers and evidence-linked insights of the last AI call in this run. Nothing is guessed: unknown answers stay unknown and route to “Unclear”.')}</Hint>
        </div>
      );
    case 'ai.callback':
      return (
        <div className="space-y-4">
          <SwitchField label={t('workflowBuilder.form.useRequestedTime', 'Use the time the lead asked for')} checked={c.useRequestedTime !== false} onChange={(v) => set({ useRequestedTime: v })} />
          <NumberField label={t('workflowBuilder.form.defaultDelay', 'Otherwise call back after')} suffix={t('workflowBuilder.unit.minutesShort', 'min')} value={c.delayMinutes ?? 120} min={5} onChange={(v) => set({ delayMinutes: v })} issues={f('delayMinutes')} />
          <SelectField label={t('workflowBuilder.form.callbackAgent', 'AI agent for the callback')} value={c.agentId} onChange={(v) => set({ agentId: v })} options={agentOptions((a) => a.usage !== 'inbound')} allowNone
            noneLabel={t('workflowBuilder.form.humanCallback', 'A person calls back (task in the follow-up inbox)')} issues={f('agentId')}
            help={t('workflowBuilder.help.callbackAgent', 'AI callbacks run through follow-up calling and respect its organisation switch and calling hours.')} />
          <TextField label={t('workflowBuilder.form.note', 'Note')} value={c.note || ''} onChange={(v) => set({ note: v })} multiline rows={2} />
          <SwitchField label={t('workflowBuilder.form.waitForCompletion', 'Wait until the callback is done')} checked={Boolean(c.waitForCompletion)} onChange={(v) => set({ waitForCompletion: v })} />
          {c.waitForCompletion && <NumberField label={t('workflowBuilder.form.timeout', 'Give up after')} suffix={t('workflowBuilder.unit.hoursShort', 'h')} value={c.timeoutHours ?? 72} min={1} onChange={(v) => set({ timeoutHours: v })} issues={f('timeoutHours')} />}
        </div>
      );

    // ------------------------------------------------------------------ messages
    case 'msg.sms':
    case 'msg.email':
    case 'msg.whatsapp': {
      const tplOptions = templates.map((tp) => ({ value: tp._id, label: tp.name, hint: tp.channel === 'whatsapp' && tp.whatsapp?.approvalStatus && tp.whatsapp.approvalStatus !== 'approved' ? t('workflowBuilder.form.notApproved', 'not approved') : undefined }));
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.template', 'Template')} value={c.templateId} onChange={(v) => set({ templateId: v })} options={tplOptions} allowNone={channel !== 'whatsapp'}
            noneLabel={t('workflowBuilder.form.customMessage', 'Write a custom message')} issues={f('templateId')} placeholder={t('workflowBuilder.form.chooseTemplate', 'Choose a template')} />
          {channel === 'email' && !c.templateId && <TextField label={t('workflowBuilder.form.subject', 'Subject')} value={c.subject || ''} onChange={(v) => set({ subject: v })} maxLength={200} issues={f('subject')} />}
          {channel !== 'whatsapp' && !c.templateId && (
            <div className="space-y-1.5">
              <TextField label={t('workflowBuilder.form.body', 'Message')} value={c.body || ''} onChange={(v) => set({ body: v })} multiline rows={channel === 'email' ? 7 : 4} maxLength={channel === 'email' ? 20000 : 1600} issues={f('body')} />
              <VariableChips variables={MESSAGE_VARS} onInsert={append('body')} />
              {channel === 'sms' && <p className="text-[11px] text-muted-foreground">{t('workflowBuilder.form.smsLength', '{count} characters', { count: String(c.body || '').length })}</p>}
            </div>
          )}
          <SelectField label={t('workflowBuilder.form.purpose', 'Purpose')} value={c.purpose || 'promotional'} onChange={(v) => set({ purpose: v || 'promotional' })} issues={f('purpose')}
            options={['promotional', 'transactional', 'support'].map((p) => ({ value: p, label: t(`workflowBuilder.purpose.${p}`, p) }))}
            help={t('workflowBuilder.help.purpose', 'Promotional messages require the lead’s recorded consent. Consent, opt-outs and suppression lists are checked right before sending.')} />
          <TextField label={t('workflowBuilder.form.trackedLink', 'Tracked link (optional)')} value={c.trackedLinkUrl || ''} onChange={(v) => set({ trackedLinkUrl: v })} placeholder="https://…" issues={f('trackedLinkUrl')}
            help={t('workflowBuilder.help.trackedLink', 'Insert {{link}} in the message. Each lead gets a personal link; genuine clicks can continue the workflow.')} />
          {channel === 'email' && (
            <SwitchField label={t('workflowBuilder.form.trackOpens', 'Track opens')} checked={c.trackOpens !== false} onChange={(v) => set({ trackOpens: v })}
              help={t('workflowBuilder.help.trackOpens', 'Adds an invisible image so “Email opened” can continue the workflow. Security scanners are ignored; some mail apps preload images.')} />
          )}
        </div>
      );
    }
    case 'notify.user':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.recipients', 'Notify')} value={c.recipients || 'assigned'} onChange={(v) => set({ recipients: v || 'assigned' })} issues={f('recipients')}
            options={['assigned', 'owner', 'users'].map((o) => ({ value: o, label: t(`workflowBuilder.recipients.${o}`, o) }))} />
          {c.recipients === 'users' && <ChipToggleGroup label={t('workflowBuilder.form.users', 'Users')} options={userOptions} value={c.userIds || []} onChange={(v) => set({ userIds: v })} issues={f('userIds')} />}
          <TextField label={t('workflowBuilder.form.title', 'Title')} value={c.title || ''} onChange={(v) => set({ title: v })} maxLength={200} issues={f('title')} />
          <TextField label={t('workflowBuilder.form.message', 'Message')} value={c.message || ''} onChange={(v) => set({ message: v })} multiline rows={3} maxLength={1000} issues={f('message')} />
          <VariableChips variables={INTERNAL_VARS} onInsert={append('message')} />
          <SelectField label={t('workflowBuilder.form.priority', 'Priority')} value={c.priority || 'NORMAL'} onChange={(v) => set({ priority: v || 'NORMAL' })}
            options={['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((p) => ({ value: p, label: t(`workflowBuilder.priority.${p}`, p) }))} />
        </div>
      );
    case 'task.create':
      return (
        <div className="space-y-4">
          <TextField label={t('workflowBuilder.form.title', 'Title')} value={c.title || ''} onChange={(v) => set({ title: v })} maxLength={255} issues={f('title')} />
          <VariableChips variables={INTERNAL_VARS} onInsert={append('title')} />
          <TextField label={t('workflowBuilder.form.description', 'Description')} value={c.description || ''} onChange={(v) => set({ description: v })} multiline rows={3} />
          <SelectField label={t('workflowBuilder.form.assignee', 'Assign to')} value={c.assignee || 'assigned'} onChange={(v) => set({ assignee: v || 'assigned' })} issues={f('assignee')}
            options={['assigned', 'owner', 'user'].map((o) => ({ value: o, label: t(`workflowBuilder.assignee.${o}`, o) }))} />
          {c.assignee === 'user' && <SelectField label={t('workflowBuilder.form.user', 'User')} value={c.userId} onChange={(v) => set({ userId: v })} options={userOptions} issues={f('userId')} />}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('workflowBuilder.form.dueIn', 'Due in')} suffix={t('workflowBuilder.unit.hoursShort', 'h')} value={c.dueInHours ?? 24} min={0} onChange={(v) => set({ dueInHours: v })} issues={f('dueInHours')} />
            <SelectField label={t('workflowBuilder.form.priority', 'Priority')} value={c.priority || 'MEDIUM'} onChange={(v) => set({ priority: v || 'MEDIUM' })} issues={f('priority')}
              options={['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: t(`workflowBuilder.taskPriority.${p}`, p) }))} />
          </div>
        </div>
      );

    // ------------------------------------------------------------------ CRM
    case 'crm.update_lead':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.status', 'Set status to')} value={c.status} onChange={(v) => set({ status: v })} options={statusOptions} allowNone noneLabel={t('workflowBuilder.form.keep', 'Keep unchanged')} issues={f('status')} />
          <SelectField label={t('workflowBuilder.form.pipelineStage', 'Pipeline stage')} value={c.pipelineStage} onChange={(v) => set({ pipelineStage: v })} allowNone noneLabel={t('workflowBuilder.form.keep', 'Keep unchanged')} issues={f('pipelineStage')}
            options={['LEAD', 'FOLLOW_UP'].map((s) => ({ value: s, label: t(`workflowBuilder.pipeline.${s}`, s) }))} />
          <Hint>{t('workflowBuilder.help.converted', 'A converted lead is never moved back by automation. Every change is recorded on the lead timeline.')}</Hint>
        </div>
      );
    case 'crm.add_tags':
      return (
        <div className="space-y-4">
          <TagsInput label={t('workflowBuilder.form.addTags', 'Add tags')} value={c.add || []} onChange={(v) => set({ add: v })} issues={f('add')} />
          <TagsInput label={t('workflowBuilder.form.removeTags', 'Remove tags')} value={c.remove || []} onChange={(v) => set({ remove: v })} />
        </div>
      );
    case 'crm.assign':
      return <SelectField label={t('workflowBuilder.form.user', 'User')} value={c.userId} onChange={(v) => set({ userId: v })} options={userOptions} issues={f('userId')} placeholder={t('workflowBuilder.form.chooseUser', 'Choose a user')} />;
    case 'crm.add_note':
      return (
        <div className="space-y-2">
          <TextField label={t('workflowBuilder.form.noteText', 'Note')} value={c.text || ''} onChange={(v) => set({ text: v })} multiline rows={4} maxLength={1000} issues={f('text')} />
          <VariableChips variables={INTERNAL_VARS} onInsert={append('text')} />
        </div>
      );
    case 'crm.qualification':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.qualField', 'Qualification field')} value={c.fieldKey} onChange={(v) => set({ fieldKey: v })} issues={f('fieldKey')}
            options={catalog.qualificationKeys.map((k) => ({ value: k, label: t(`workflowBuilder.qualField.${k}`, k) }))} />
          <TextField label={t('workflowBuilder.form.value', 'Value')} value={c.value || ''} onChange={(v) => set({ value: v })} issues={f('value')} />
          <VariableChips variables={INTERNAL_VARS} onInsert={append('value')} />
        </div>
      );

    case 'crm.follow_up':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('workflowBuilder.form.dueIn', 'Due in')} suffix={t('workflowBuilder.unit.hoursShort', 'h')} value={c.dueInHours ?? 24} min={0} onChange={(v) => set({ dueInHours: v })} issues={f('dueInHours')} />
            <SelectField label={t('workflowBuilder.form.channel', 'Channel')} value={c.channel || 'phone'} onChange={(v) => set({ channel: v || 'phone' })} issues={f('channel')}
              options={['phone', 'sms', 'email', 'whatsapp', 'in_person', 'other'].map((o) => ({ value: o, label: t(`workflowBuilder.followUpChannel.${o}`, o) }))} />
          </div>
          <SelectField label={t('workflowBuilder.form.assignee', 'Assign to')} value={c.assignee || 'assigned'} onChange={(v) => set({ assignee: v || 'assigned' })} issues={f('assignee')}
            options={['assigned', 'owner', 'user'].map((o) => ({ value: o, label: t(`workflowBuilder.assignee.${o}`, o) }))} />
          {c.assignee === 'user' && <SelectField label={t('workflowBuilder.form.user', 'User')} value={c.userId} onChange={(v) => set({ userId: v })} options={userOptions} issues={f('userId')} />}
          <TextField label={t('workflowBuilder.form.note', 'Note')} value={c.note || ''} onChange={(v) => set({ note: v })} multiline rows={3} maxLength={2000} issues={f('note')} />
          <VariableChips variables={INTERNAL_VARS} onInsert={append('note')} />
          <Hint>{t('workflowBuilder.help.followUp', 'Appears in the follow-up inbox of the chosen person with a due date and reminder — the person decides how to follow up.')}</Hint>
        </div>
      );
    case 'crm.custom_fields':
      return <CustomFieldsForm c={c} set={set} f={f} append={INTERNAL_VARS} />;
    case 'integration.webhook':
      return (
        <div className="space-y-4">
          <TextField label={t('workflowBuilder.form.webhookTarget', 'Receiving address (https)')} value={c.url || ''} onChange={(v) => set({ url: v })} placeholder="https://" issues={f('url')}
            help={t('workflowBuilder.help.webhookTarget', 'For Zapier, Make, n8n or your own system. Internal network addresses are blocked for security.')} />
          <SwitchField label={t('workflowBuilder.form.includeLead', 'Include lead details')} help={t('workflowBuilder.help.includeLead', 'Name, email, phone and status of the lead are sent along.')} checked={c.includeLead !== false} onChange={(v) => set({ includeLead: v })} />
          <NumberField label={t('workflowBuilder.form.timeoutSeconds', 'Wait for an answer up to')} suffix="s" value={c.timeoutSeconds ?? 10} min={1} max={30} onChange={(v) => set({ timeoutSeconds: v })} issues={f('timeoutSeconds')} />
          <Hint>{t('workflowBuilder.help.webhookDelivery', 'Each request carries an idempotency key and, if configured on the server, an HMAC signature. Server errors are retried up to 5 times; then the “Failed” branch continues.')}</Hint>
        </div>
      );

    // ------------------------------------------------------------------ logic
    case 'logic.condition':
      return (
        <div className="space-y-3">
          <ConditionBuilder value={c.rules as ConditionGroup} onChange={(rules) => set({ rules })} issues={issues} nodeOptions={nodeOptions} qualificationKeys={catalog.qualificationKeys} />
          <Hint>{t('workflowBuilder.help.condition', 'Values are read live when the step runs. Unknown values never match “equals” — use “does not exist” to branch on missing data.')}</Hint>
        </div>
      );
    case 'logic.delay':
      return <DelayForm c={c} set={set} f={f} dayOptions={dayOptions} />;
    case 'logic.wait_event':
      return (
        <div className="space-y-4">
          <ChipToggleGroup label={t('workflowBuilder.form.events', 'Continue when')} options={catalog.waitableEvents.map((e) => ({ value: e, label: t(`workflow.waitEvent.${e}`, e) }))}
            value={c.events || []} onChange={(v) => set({ events: v })} issues={f('events')} />
          <NumberField label={t('workflowBuilder.form.timeout', 'Give up after')} suffix={t('workflowBuilder.unit.hoursShort', 'h')} value={c.timeoutHours ?? 48} min={1} onChange={(v) => set({ timeoutHours: v })} issues={f('timeoutHours')}
            help={t('workflowBuilder.help.waitTimeout', 'If nothing happens in time the “Timed out” branch continues.')} />
        </div>
      );
    case 'end':
      return (
        <div className="space-y-4">
          <SelectField label={t('workflowBuilder.form.outcome', 'Outcome')} value={c.outcome || 'completed'} onChange={(v) => set({ outcome: v || 'completed' })} issues={f('outcome')}
            options={catalog.endOutcomes.map((o) => ({ value: o, label: t(`workflow.outcome.${o}`, o) }))}
            help={t(`workflowBuilder.outcomeHelp.${c.outcome || 'completed'}`, '')} />
          <SwitchField label={t('workflowBuilder.form.updateLeadStatus', 'Update the lead status')} help={t('workflowBuilder.help.updateLeadStatus', 'Qualified → qualified, not interested / opted out → unqualified, converted → converted.')}
            checked={c.updateLeadStatus !== false} onChange={(v) => set({ updateLeadStatus: v })} />
          <TextField label={t('workflowBuilder.form.endNote', 'Timeline note (optional)')} value={c.note || ''} onChange={(v) => set({ note: v })} multiline rows={2} />
        </div>
      );
    default:
      return <Hint>{t('workflowBuilder.help.noConfig', 'This step has no settings.')}</Hint>;
  }
}

function DelayForm({ c, set, f, dayOptions }: { c: Cfg; set: (p: Cfg) => void; f: (k: string) => ValidationIssue[]; dayOptions: Option[] }) {
  const { t } = useLanguage();
  const bh = c.businessHours || { enabled: false, start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] };
  return (
    <div className="space-y-4">
      <SelectField label={t('workflowBuilder.form.delayMode', 'Wait')} value={c.mode || 'duration'} onChange={(v) => set({ mode: v || 'duration' })} issues={f('mode')}
        options={['duration', 'until', 'time_of_day', 'next_business_day'].map((m) => ({ value: m, label: t(`workflowBuilder.delayMode.${m}`, m) }))} />
      {c.mode === 'duration' || !c.mode ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t('workflowBuilder.form.amount', 'Amount')} value={c.amount ?? 1} min={1} onChange={(v) => set({ amount: v })} issues={f('amount')} />
          <SelectField label={t('workflowBuilder.form.unit', 'Unit')} value={c.unit || 'days'} onChange={(v) => set({ unit: v || 'days' })} issues={f('unit')}
            options={['minutes', 'hours', 'days'].map((u) => ({ value: u, label: t(`workflowBuilder.unit.${u}`, u) }))} />
        </div>
      ) : c.mode === 'until' ? (
        <TextField type="datetime-local" label={t('workflowBuilder.form.until', 'Date and time')} value={c.until ? String(c.until).slice(0, 16) : ''} onChange={(v) => set({ until: v ? new Date(v).toISOString() : null })} issues={f('until')} />
      ) : (
        <TextField type="time" label={t('workflowBuilder.form.time', 'Time')} value={c.time || '09:00'} onChange={(v) => set({ time: v })} issues={f('time')} />
      )}
      <SelectField label={t('workflowBuilder.form.timezoneMode', 'Time zone')} value={c.timezoneMode || 'lead'} onChange={(v) => set({ timezoneMode: v || 'lead' })}
        options={[{ value: 'lead', label: t('workflowBuilder.form.tzLead', 'Lead’s local time') }, { value: 'fixed', label: t('workflowBuilder.form.tzFixed', 'Fixed time zone') }]}
        help={t('workflowBuilder.help.timezone', 'The lead’s time zone comes from its country; if unknown, the time zone below is used.')} />
      <TextField label={t('workflowBuilder.form.timezone', 'Time zone')} value={c.timezone || 'Europe/Zurich'} onChange={(v) => set({ timezone: v })} issues={f('timezone')} placeholder="Europe/Zurich" />
      <SwitchField label={t('workflowBuilder.form.businessHours', 'Only during business hours')} checked={Boolean(bh.enabled)} onChange={(v) => set({ businessHours: { ...bh, enabled: v } })}
        help={t('workflowBuilder.help.businessHours', 'If the wait ends outside business hours, continue at the next opening.')} />
      {(bh.enabled || c.mode === 'next_business_day') && (
        <div className="space-y-3 rounded-xl border p-3">
          {bh.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <TextField type="time" label={t('workflowBuilder.form.opens', 'Opens')} value={bh.start} onChange={(v) => set({ businessHours: { ...bh, start: v } })} issues={f('businessHours')} />
              <TextField type="time" label={t('workflowBuilder.form.closes', 'Closes')} value={bh.end} onChange={(v) => set({ businessHours: { ...bh, end: v } })} />
            </div>
          )}
          <ChipToggleGroup label={t('workflowBuilder.form.businessDays', 'Business days')} options={dayOptions} value={(bh.days || []).map(String)} onChange={(v) => set({ businessHours: { ...bh, days: v.map(Number) } })} />
        </div>
      )}
    </div>
  );
}

const CUSTOM_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

function CustomFieldsForm({ c, set, f, append: vars }: { c: Cfg; set: (p: Cfg) => void; f: (field: string) => ValidationIssue[]; append: string[] }) {
  const { t } = useLanguage();
  const rows: Array<{ key: string; value: string }> = Array.isArray(c.set) ? c.set : [];
  const update = (i: number, patch: Partial<{ key: string; value: string }>) => set({ set: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-4">
      <Field label={t('workflowBuilder.form.customFieldsSet', 'Set fields')} issues={f('set')}
        help={t('workflowBuilder.help.customFieldKey', 'Field names: letters, digits and _, starting with a letter (max. 40). Existing fields with the same name are overwritten; other fields stay.')}>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="space-y-1.5 rounded-md border p-2">
              <div className="flex items-center gap-2">
                <input value={row.key} onChange={(e) => update(i, { key: e.target.value.replace(/\s+/g, '_') })} maxLength={40} aria-label={t('workflowBuilder.form.customFieldKey', 'Field name')}
                  placeholder={t('workflowBuilder.form.customFieldKey', 'Field name')} aria-invalid={Boolean(row.key) && !CUSTOM_KEY.test(row.key)}
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-destructive" />
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => set({ set: rows.filter((_, j) => j !== i) })}
                  aria-label={t('workflowBuilder.form.removeCustomField', 'Remove field {key}', { key: row.key || String(i + 1) })}>×</Button>
              </div>
              <input value={row.value} onChange={(e) => update(i, { value: e.target.value })} maxLength={500} aria-label={t('workflowBuilder.form.customFieldValue', 'Value')}
                placeholder={t('workflowBuilder.form.customFieldValue', 'Value')} className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
              <VariableChips variables={vars} onInsert={(token) => update(i, { value: `${row.value || ''}${token}` })} />
            </div>
          ))}
          {rows.length < 25 && (
            <Button type="button" variant="outline" size="sm" onClick={() => set({ set: [...rows, { key: '', value: '' }] })}>
              {t('workflowBuilder.form.addCustomField', 'Add field')}
            </Button>
          )}
        </div>
      </Field>
      <TagsInput label={t('workflowBuilder.form.customFieldsRemove', 'Remove fields')} value={c.remove || []} onChange={(v) => set({ remove: v })} issues={f('remove')} />
      <Hint>{t('workflowBuilder.help.customFields', 'Custom fields appear on the lead and can be checked later with a condition (“Lead → Custom field”).')}</Hint>
    </div>
  );
}

function TagsInput({ label, value, onChange, issues }: { label: string; value: string[]; onChange: (v: string[]) => void; issues?: ValidationIssue[] }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const add = () => {
    const tags = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (tags.length) onChange([...new Set([...value, ...tags])].slice(0, 30));
    setDraft('');
  };
  return (
    <Field label={label} issues={issues}>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/30">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))} aria-label={t('workflowBuilder.form.removeTag', 'Remove {tag}', { tag })} className="opacity-70 hover:opacity-100">×</button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none" placeholder={t('workflowBuilder.form.tagPlaceholder', 'Type and press Enter')} maxLength={50} />
      </div>
    </Field>
  );
}

function WebhookInfo({ workflowId, token }: { workflowId: string; token?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => (token ? `${String(API_URL).replace(/\/+$/, '')}/workflow-hooks/${workflowId}/${token}` : ''), [token, workflowId]);
  if (!token) return <Hint>{t('workflowBuilder.help.webhookSave', 'Save the workflow to generate its secret webhook URL.')}</Hint>;
  return (
    <div className="space-y-3">
      <Field label={t('workflowBuilder.form.webhookUrl', 'Webhook URL (keep secret)')}>
        <div className="flex gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2 py-2 font-mono text-[11px]" title={url}>{url}</code>
          <Button type="button" size="icon" variant="outline" className="size-9 shrink-0" aria-label={t('workflowBuilder.form.copy', 'Copy')}
            onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </Field>
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100" dir="ltr">{`POST ${url}
Content-Type: application/json

{ "email": "lead@example.com",   // or "leadId" / "phone"
  "eventId": "order-1042",        // optional, de-duplicates
  "data": { "plan": "pro" } }`}</pre>
      <Hint>{t('workflowBuilder.help.webhook', 'Only existing leads can be enrolled. Requests with the same eventId start the workflow once.')}</Hint>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-xs leading-relaxed text-sky-900 dark:text-sky-200">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />{children}
    </p>
  );
}
