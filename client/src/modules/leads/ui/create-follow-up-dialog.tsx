'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, CalendarClock, Loader2, Search } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useCreateFollowUp, useFollowUpAgents, useFollowUpAiAction } from '../hooks/use-lead-workflow';
import { leadApi } from '../services/lead-api';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage } from './lead-ui-kit';
import { getUserDisplayName, type LeadUser } from './lead-ui-utils';
import { AgentPickerHint, AgentSelect } from './follow-up-ai';

export const FOLLOW_UP_CHANNELS = ['phone', 'email', 'sms', 'whatsapp', 'in_person', 'letter', 'other'] as const;
export const CHANNEL_LABELS: Record<string, string> = { phone: 'Phone', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', in_person: 'In person', letter: 'Letter', other: 'Other' };
const TASK_CHANNEL: Record<string, string> = { EMAIL: 'email', PHONE_CALL: 'phone', AI_CALL: 'phone', SMS: 'sms', MEETING: 'in_person', CUSTOM_TASK: 'other' };
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Mounted only while open so each new follow-up starts with a fresh form. */
export function CreateFollowUpDialog({ onClose, onCreated, users, tz }: {
  onClose: () => void; onCreated: (dueAt: string) => void; users: LeadUser[]; tz: string;
}) {
  const { t } = useLanguage();
  const create = useCreateFollowUp();
  const assign = useFollowUpAiAction();
  const { hasPermission } = usePermissions();
  const canAssignAi = hasPermission('ai-calling:read') && hasPermission('ai-calling:write');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [channel, setChannel] = useState('phone');
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  const [taskType, setTaskType] = useState('PHONE_CALL');
  const [priority, setPriority] = useState('NORMAL');
  const [reminder, setReminder] = useState('');
  const [agentId, setAgentId] = useState('');
  const [instructions, setInstructions] = useState('');
  const aiCall = taskType === 'AI_CALL';
  const agents = useFollowUpAgents(aiCall && canAssignAi);
  const usableAgents = (agents.data ?? []).filter((agent) => agent.followUp.enabled);
  // An AI call needs an agent whenever one can be chosen; without one it stays a phone task for the owner.
  const needsAgent = aiCall && canAssignAi && usableAgents.length > 0;
  const busy = create.isPending || assign.isPending;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const leads = useQuery({
    queryKey: ['leads', 'follow-up-picker', search],
    queryFn: () => leadApi.listLeads({ q: search || undefined, limit: 20 }),
    staleTime: 15_000,
  });
  const validDate = Number.isFinite(new Date(dueAt).getTime()) && new Date(dueAt).getTime() > now;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lead || !validDate || busy || (needsAgent && !agentId)) return;
    if (new Date(dueAt).getTime() <= Date.now()) {
      showError(t('leads.followUps.futureDate', 'Choose a future date and time.'));
      setNow(Date.now());
      return;
    }
    let created;
    try {
      created = await create.mutateAsync({ leadId: lead.id, dueAt: new Date(dueAt).toISOString(), timezone: tz, channel, ownerId: ownerId || null, note: note.trim() || null, taskType, priority, reminderMinutes: reminder ? Number(reminder) : null });
    } catch (err) {
      showError(err);
      return;
    }
    if (aiCall && canAssignAi && agentId && created?.id) {
      try {
        await assign.mutateAsync({ id: created.id, action: 'assign-agent', body: { agentId, instructions: instructions.trim() || null } });
      } catch (err) {
        // The follow-up exists; say so instead of pretending nothing happened.
        showError(t('leads.followUps.ai.createAssignFailed', 'The follow-up was scheduled, but the AI agent could not be assigned: {message}', { message: (err as { message?: string })?.message ?? '' }));
        onCreated(dueAt);
        return;
      }
      showSuccess(t('leads.followUps.ai.createdWithAgent', 'Follow-up scheduled for the AI agent'));
      onCreated(dueAt);
      return;
    }
    showSuccess(t('leads.followUps.created', 'Follow-up scheduled'));
    onCreated(dueAt);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leads.followUps.createTitle', 'Schedule a follow-up')}</DialogTitle>
          <DialogDescription>{t('leads.followUps.createDescription', 'Choose a lead, set a time, and plan your next conversation.')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { void submit(event); }} className="space-y-5 px-5 pb-5">
          <div className="space-y-2">
            <Label htmlFor="fu-lead-search">{t('leads.followUps.lead', 'Lead')}</Label>
            {lead ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <span className="truncate text-sm font-medium">{lead.name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setLead(null)}>{t('common.change', 'Change')}</Button>
              </div>
            ) : (
              <>
                <div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="fu-lead-search" maxLength={200} className="ps-9" placeholder={t('leads.followUps.findLead', 'Search leads by name…')} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border" aria-busy={leads.isFetching}>
                  {leads.isLoading ? <p role="status" className="p-3 text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p> : leads.isError ? <Button type="button" variant="ghost" onClick={() => void leads.refetch()}>{t('leads.followUps.leadsError', 'Could not load leads. Retry')}</Button> : !leads.data?.data.length ? <p className="p-3 text-sm text-muted-foreground">{t('leads.followUps.noLeads', 'No leads found. Try another name or create a lead first.')}</p> : leads.data.data.map((item) => (
                    <button type="button" key={item.id} onClick={() => setLead({ id: item.id, name: item.name })} className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                      <span className="truncate font-medium">{item.name}</span><span className="shrink-0 text-xs text-muted-foreground">{item.leadNumber}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fu-create-date">{t('leads.followUps.dueDate', 'Date and time')}</Label>
            <Input id="fu-create-date" type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-describedby="fu-create-timezone" />
            <p id="fu-create-timezone" className="text-xs text-muted-foreground">{t('leads.followUps.schedulingTimezone', 'Schedule in {tz}. Choose a future date and time.', { tz })}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="fu-create-channel">{t('leads.followUps.channel', 'Channel')}</Label><select id="fu-create-channel" className={selectClass} value={channel} onChange={(e) => { setChannel(e.target.value); setTaskType(Object.keys(TASK_CHANNEL).find((key) => TASK_CHANNEL[key] === e.target.value) || 'CUSTOM_TASK'); }}>{FOLLOW_UP_CHANNELS.map((key) => <option key={key} value={key}>{t(`leads.followUps.channel.${key}`, CHANNEL_LABELS[key])}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="fu-create-owner">{t('leads.followUps.owner', 'Owner')}</Label><select id="fu-create-owner" className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">{t('leads.followUps.assignMe', 'Assign to me')}</option>{users.map((user) => <option key={user.id} value={user.id}>{getUserDisplayName(user) || user.id}</option>)}</select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="fu-create-note">{t('leads.followUps.note', 'Notes (optional)')}</Label><Textarea id="fu-create-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('leads.followUps.notePlaceholder', 'What would you like to follow up on?')} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="fu-task-type">{t('leads.followUps.taskType', 'Activity type')}</Label><select id="fu-task-type" className={selectClass} value={taskType} onChange={(event) => { const value = event.target.value; setTaskType(value); setChannel(TASK_CHANNEL[value] || 'other'); }}>{['EMAIL', 'PHONE_CALL', 'AI_CALL', 'SMS', 'MEETING', 'CUSTOM_TASK'].map((value) => <option key={value} value={value}>{t(`leads.followUps.type.${value}`, value.replace(/_/g, ' ').toLowerCase())}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="fu-priority">{t('leads.followUps.priority', 'Priority')}</Label><select id="fu-priority" className={selectClass} value={priority} onChange={(event) => setPriority(event.target.value)}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{t(`leads.followUps.priority.${value}`, value.toLowerCase())}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="fu-reminder">{t('leads.followUps.reminder', 'Reminder')}</Label><select id="fu-reminder" className={selectClass} value={reminder} onChange={(event) => setReminder(event.target.value)}><option value="">{t('leads.followUps.noReminder', 'No reminder')}</option>{[15, 60, 1440].map((minutes) => <option key={minutes} value={minutes}>{t('leads.followUps.reminderMinutes', '{minutes} minutes before', { minutes })}</option>)}</select></div>
          </div>
          {aiCall && (
            <fieldset className="space-y-3 rounded-lg border border-blue-500/25 bg-gradient-to-br from-blue-600/[0.05] via-transparent to-cyan-500/[0.06] p-3">
              <legend className="inline-flex items-center gap-1.5 px-1 text-sm font-medium"><Bot className="h-4 w-4 text-blue-600 dark:text-sky-300" aria-hidden="true" />{t('leads.followUps.ai.createSection', 'AI follow-up call')}</legend>
              {!canAssignAi ? (
                <p className="text-xs text-muted-foreground">{t('leads.followUps.ai.noAccess', 'You need AI calling access to hand this follow-up to an AI agent. It is created as a phone task for the owner.')}</p>
              ) : agents.isLoading ? (
                <p role="status" className="text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</p>
              ) : agents.isError ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => void agents.refetch()}>{t('leads.followUps.ai.agentsRetry', 'AI agents could not be loaded. Retry')}</Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fu-create-agent">{t('leads.followUps.ai.agent', 'AI agent')}</Label>
                    <AgentSelect id="fu-create-agent" agents={agents.data ?? []} value={agentId} onChange={setAgentId} t={t} describedBy="fu-create-agent-hint" />
                    <AgentPickerHint id="fu-create-agent-hint" agents={agents.data ?? []} t={t} />
                  </div>
                  {usableAgents.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="fu-create-instructions">{t('leads.followUps.ai.instructions', 'Instructions for this follow-up (optional)')}</Label>
                      <Textarea id="fu-create-instructions" rows={3} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} dir="auto"
                        placeholder={t('leads.followUps.ai.instructionsPlaceholder', 'For example: confirm the appointment date and ask whether the budget is approved.')} />
                    </div>
                  )}
                </>
              )}
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" disabled={!lead || !validDate || busy || (needsAgent && !agentId)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="h-4 w-4" aria-hidden="true" />}{t('leads.followUps.schedule', 'Schedule follow-up')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
