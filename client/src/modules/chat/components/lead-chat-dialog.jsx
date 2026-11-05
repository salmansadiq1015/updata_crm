'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Users, UserPlus, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { queryKeys } from '@/lib/query/keys';
import { leadApi } from '@/modules/leads/services/lead-api';
import { LeadFormDialog } from '@/modules/leads/ui/lead-form-dialog';
import { chatService } from '../services/chat-service';

export function LeadChatDialog({ open, onOpenChange, room, onNavigate }) {
  const { t } = useLanguage();
  const tr = key => t(`chat.workspace.${key}`);
  const router = useRouter();
  const client = useQueryClient();
  const { hasPermission } = usePermissions();
  const userId = useAuthStore(state => state.user?._id);
  const [name, setName] = useState(room?.roomType === 'LEAD' ? room.name || '' : '');
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 250);
  const [selected, setSelected] = useState((room?.leadIds || []).filter(lead => lead?._id));
  const [memberIds, setMemberIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [creatingLead, setCreatingLead] = useState(false);
  const leads = useQuery({ queryKey: ['chat', 'lead-picker', q], queryFn: async () => { const result = await leadApi.listLeads({ q, limit: 30 }); return { ...result, data: result.data.map(lead => ({ ...lead, _id: lead.id })) }; }, enabled: open && hasPermission('lead:read') });
  const teamSearch = useDebounce(memberSearch, 250);
  const users = useQuery({ queryKey: ['chat', 'lead-members', teamSearch], queryFn: () => chatService.listUsers(teamSearch), enabled: open && !room });
  const mutation = useMutation({
    mutationFn: () => room ? chatService.updateRoomLeads(room._id, { leadIds: selected.map(lead => lead._id), version: room.__v || 0, ...(room.roomType === 'LEAD' && { name: name.trim() }) }) : chatService.createLeadRoom({ name: name.trim() || selected.map(lead => lead.name).join(', ').slice(0, 100), leadIds: selected.map(lead => lead._id), memberIds }),
    onSuccess: updated => {
      client.setQueryData(queryKeys.chat.room(updated._id), updated);
      client.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      onOpenChange(false); onNavigate?.();
      router.push(`/field-ops/chat?chatId=${updated._id}`);
    },
  });
  const selectedIds = useMemo(() => new Set(selected.map(lead => lead._id)), [selected]);
  function toggle(lead) { setSelected(previous => selectedIds.has(lead._id) ? previous.filter(item => item._id !== lead._id) : previous.length < 25 ? [...previous, lead] : previous); }
  return <>
    <Dialog open={open && !creatingLead} onOpenChange={next => { if (!mutation.isPending) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader><DialogTitle>{tr(room ? 'manageLeads' : 'newLeadChat')}</DialogTitle><DialogDescription>{tr('leadChatDescription')}</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
          {(!room || room.roomType === 'LEAD') && <label className="block space-y-2 text-sm font-medium">{tr('conversationName')}<Input value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder={tr('nameHint')} /></label>}
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{tr('linkedLeads')} <span className="text-muted-foreground">{selected.length}/25</span></p>{hasPermission('lead:write') && <Button variant="outline" size="sm" onClick={() => setCreatingLead(true)}><Plus className="size-3.5" />{tr('createLead')}</Button>}</div>
          {selected.length > 0 && <div className="flex flex-wrap gap-2">{selected.map(lead => <span key={lead._id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs text-primary"><span className="truncate">{lead.name}</span><button type="button" aria-label={`${tr('removeLead')}: ${lead.name}`} onClick={() => toggle(lead)} className="rounded-full p-1 hover:bg-primary/10"><X className="size-3" /></button></span>)}</div>}
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label={tr('searchLeads')} value={search} onChange={event => setSearch(event.target.value)} className="ps-9" placeholder={tr('searchLeads')} /></div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-1" aria-label={tr('searchLeads')}>
            {leads.isLoading ? <p className="p-4 text-sm text-muted-foreground">{tr('loading')}</p> : leads.isError ? <div className="p-4 text-sm"><p role="alert">{tr('loadFailed')}</p><Button variant="outline" size="sm" onClick={() => leads.refetch()}>{t('common.retry')}</Button></div> : !leads.data?.data?.length ? <p className="p-4 text-sm text-muted-foreground">{tr('noLeads')}</p> : leads.data.data.map(lead => <label key={lead._id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent"><input type="checkbox" checked={selectedIds.has(lead._id)} disabled={mutation.isPending || (!selectedIds.has(lead._id) && selected.length >= 25)} onChange={() => toggle(lead)} className="size-4 accent-sky-500" /><UserPlus className="size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{lead.name}</span><span className="block text-xs text-muted-foreground">{lead.leadNumber || lead.email || lead.phone || '—'}</span></span></label>)}
          </div>
          {!room && <div className="space-y-2"><label className="block space-y-2 text-sm font-medium"><span className="inline-flex items-center gap-2"><Users className="size-4 text-primary" />{tr('participants')}</span><Input aria-label={tr('searchTeam')} value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder={tr('searchTeam')} /></label><p className="text-xs text-muted-foreground">{tr('participantsHint')}</p><div className="max-h-32 overflow-y-auto">{users.isError && <p role="alert" className="text-sm text-destructive">{tr('loadFailed')}</p>}{(users.data || []).filter(user => String(user._id) !== String(userId) && `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(memberSearch.toLowerCase())).map(user => <label key={user._id} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-accent"><input type="checkbox" checked={memberIds.includes(user._id)} onChange={() => setMemberIds(ids => ids.includes(user._id) ? ids.filter(id => id !== user._id) : [...ids, user._id])} className="size-4 accent-sky-500" />{user.firstName} {user.lastName}</label>)}</div></div>}
          {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error?.message || tr('saveFailed')}</p>}
        </div>
        <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button disabled={mutation.isPending || (!selected.length && (!room || room.roomType === 'LEAD')) || (room?.roomType === 'LEAD' && !name.trim())} onClick={() => mutation.mutate()}>{mutation.isPending && <Loader2 className="size-4 animate-spin" />}{tr(room ? 'saveChanges' : 'startChat')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {creatingLead && <LeadFormDialog open onOpenChange={setCreatingLead} onSaved={lead => { setSelected(previous => [...previous.filter(item => item._id !== lead.id), { ...lead, _id: lead.id }].slice(0, 25)); client.invalidateQueries({ queryKey: ['chat', 'lead-picker'] }); }} />}
  </>;
}
