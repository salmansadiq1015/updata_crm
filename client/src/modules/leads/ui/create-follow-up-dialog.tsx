'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, Search } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import { useCreateFollowUp } from '../hooks/use-lead-workflow';
import { leadApi } from '../services/lead-api';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage } from './lead-ui-kit';
import { getUserDisplayName, type LeadUser } from './lead-ui-utils';

export const FOLLOW_UP_CHANNELS = ['phone', 'email', 'sms', 'whatsapp', 'in_person', 'letter', 'other'] as const;
export const CHANNEL_LABELS: Record<string, string> = { phone: 'Phone', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', in_person: 'In person', letter: 'Letter', other: 'Other' };
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Mounted only while open so each new follow-up starts with a fresh form. */
export function CreateFollowUpDialog({ onClose, onCreated, users, tz }: {
  onClose: () => void; onCreated: (dueAt: string) => void; users: LeadUser[]; tz: string;
}) {
  const { t } = useLanguage();
  const create = useCreateFollowUp();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [channel, setChannel] = useState('phone');
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
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
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!lead || !validDate || create.isPending) return;
    if (new Date(dueAt).getTime() <= Date.now()) {
      showError(t('leads.followUps.futureDate', 'Choose a future date and time.'));
      setNow(Date.now());
      return;
    }
    create.mutate({ leadId: lead.id, dueAt: new Date(dueAt).toISOString(), timezone: tz, channel, ownerId: ownerId || null, note: note.trim() || null }, {
      onSuccess: () => { showSuccess(t('leads.followUps.created', 'Follow-up scheduled')); onCreated(dueAt); },
      onError: showError,
    });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !create.isPending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('leads.followUps.createTitle', 'Schedule a follow-up')}</DialogTitle>
          <DialogDescription>{t('leads.followUps.createDescription', 'Choose a lead, set a time, and plan your next conversation.')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
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
            <div className="space-y-2"><Label htmlFor="fu-create-channel">{t('leads.followUps.channel', 'Channel')}</Label><select id="fu-create-channel" className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value)}>{FOLLOW_UP_CHANNELS.map((key) => <option key={key} value={key}>{t(`leads.followUps.channel.${key}`, CHANNEL_LABELS[key])}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="fu-create-owner">{t('leads.followUps.owner', 'Owner')}</Label><select id="fu-create-owner" className={selectClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">{t('leads.followUps.assignMe', 'Assign to me')}</option>{users.map((user) => <option key={user.id} value={user.id}>{getUserDisplayName(user) || user.id}</option>)}</select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="fu-create-note">{t('leads.followUps.note', 'Notes (optional)')}</Label><Textarea id="fu-create-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('leads.followUps.notePlaceholder', 'What would you like to follow up on?')} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
            <Button type="submit" disabled={!lead || !validDate || create.isPending}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="h-4 w-4" aria-hidden="true" />}{t('leads.followUps.schedule', 'Schedule follow-up')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
