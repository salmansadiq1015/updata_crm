'use client';
import { useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Mail, Send, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { leadApi } from '@/modules/leads/services/lead-api';
import { LeadOutreachComposer } from '@/modules/leads/ui/lead-outreach-composer';
import { LeadConversationHistory } from '@/modules/leads/ui/lead-conversation-history';
import { leadWorkflowKeys } from '@/modules/leads/hooks/use-lead-workflow';

export function ChatLeadMessages({ room }) {
  const { t } = useLanguage();
  const tr = key => t(`chat.workspace.${key}`);
  const { hasPermission } = usePermissions();
  const client = useQueryClient();
  const leads = (room.leadIds || []).filter(lead => lead?._id);
  const [activeId, setActiveId] = useState(leads[0]?._id);
  const [selectedIds, setSelectedIds] = useState(leads.map(lead => lead._id));
  const [compose, setCompose] = useState(false);
  const [channel, setChannel] = useState('email');
  const queries = useQueries({ queries: leads.map(lead => ({ queryKey: ['chat', 'outreach-lead', lead._id], queryFn: () => leadApi.getLead(lead._id), staleTime: 30_000 })) });
  const selected = queries.flatMap(query => query.data && selectedIds.includes(query.data.id) ? [query.data] : []);
  const loading = queries.some((query, index) => selectedIds.includes(leads[index]._id) && query.isLoading);
  const loadError = queries.some((query, index) => selectedIds.includes(leads[index]._id) && query.isError);
  const activeLead = leads.some(lead => lead._id === activeId) ? activeId : leads[0]?._id;
  function refresh() { leads.forEach(lead => client.invalidateQueries({ queryKey: leadWorkflowKeys.timelineRoot(lead._id) })); }
  return <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label={tr('leadMessages')}>
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-2xl border border-primary/15 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-base font-semibold"><Mail className="size-4 text-primary" />{tr('contactLeads')}</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">{tr('externalHint')}</p></div><Button variant="outline" size="icon" aria-label={tr('refreshHistory')} onClick={refresh}><RefreshCw className="size-4" /></Button></div>
        <fieldset className="mt-4"><legend className="mb-2 text-xs font-medium text-muted-foreground">{tr('recipients')} ({selectedIds.length})</legend><div className="flex flex-wrap gap-2">{leads.map(lead => <label key={lead._id} className="inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm has-checked:border-primary/35 has-checked:bg-primary/5"><input type="checkbox" className="size-4 accent-sky-500" checked={selectedIds.includes(lead._id)} onChange={() => setSelectedIds(ids => ids.includes(lead._id) ? ids.filter(id => id !== lead._id) : [...ids, lead._id])} /><span className="truncate">{lead.name}</span></label>)}</div></fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Select value={channel} onValueChange={setChannel}><SelectTrigger className="w-36" aria-label={tr('channel')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select><Button disabled={!hasPermission('crm:write') || !selected.length || loading || loadError} onClick={() => setCompose(true)}><Send className="size-4" />{tr('composeExternal')} ({selectedIds.length})</Button></div>
        {!hasPermission('crm:write') && <p className="mt-2 text-xs text-muted-foreground">{tr('externalReadOnly')}</p>}
        {loadError && <p role="alert" className="mt-2 text-sm text-destructive">{tr('loadFailed')} <button type="button" className="underline" onClick={() => queries.forEach(query => query.refetch())}>{t('common.retry')}</button></p>}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4 text-primary" />{tr('leadHistory')}</h2><Select value={activeLead} onValueChange={setActiveId}><SelectTrigger aria-label={tr('historyForLead')} className="w-56 max-w-full"><SelectValue /></SelectTrigger><SelectContent>{leads.map(lead => <SelectItem key={lead._id} value={lead._id}>{lead.name}</SelectItem>)}</SelectContent></Select></div>{activeLead && <LeadConversationHistory key={activeLead} leadId={activeLead} />}</div>
    </div>
    {compose && <LeadOutreachComposer open leads={selected} defaultChannel={channel} onOpenChange={setCompose} onComplete={refresh} />}
  </section>;
}
