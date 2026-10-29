'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, Users } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useAgentMutations, useCallingAgents } from '../hooks/use-calling-agents';
import { callingAgentApi } from '../services/calling-agent-api';
import { AgentAvatar, AgentDialog, AgentField, inputClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { StatusPill } from './status-pill';

/** Adds a snapshot of the selected CRM leads without replacing existing defaults or starting calls. */
export function AssignLeadsToAgentDialog({ leadIds, onClose, onAssigned }: { leadIds: string[]; onClose: () => void; onAssigned: () => void }) {
  const ids = [...new Set(leadIds)];
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [availability, setAvailability] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agents = useCallingAgents({ search: q, availability: availability || undefined, page, sort: 'name' });
  const selected = useQuery({ queryKey: ['ai-calling', 'agent', selectedId], queryFn: () => callingAgentApi.get(selectedId), enabled: Boolean(selectedId) });
  const { assign } = useAgentMutations();
  const busy = saving || assign.isPending;
  const existing = selected.data?.assignedLeadIds || [];
  const added = ids.filter(id => !existing.includes(id)).length;
  const total = existing.length + added;
  const save = async () => {
    setError(null); setSaving(true);
    try {
      // Fetch the latest version immediately before adding; the server still
      // checks the version to prevent a concurrent edit from losing assignments.
      const latest = await callingAgentApi.get(selectedId);
      const result = await assign.mutateAsync({ id: latest._id, leadIds: ids, version: latest.version, mode: 'add' });
      const addedCount = result.assignedLeadIds.length - latest.assignedLeadIds.length;
      showSuccess(addedCount ? `${addedCount} lead${addedCount === 1 ? '' : 's'} assigned to ${result.name}` : `Selected leads are already assigned to ${result.name}`);
      onAssigned();
    } catch (e) { setError(readableError(e)); void selected.refetch(); } finally { setSaving(false); }
  };
  const footer = <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={primaryClass} disabled={!selected.data || selected.isFetching || selected.data.availability === 'archived' || !ids.length || total > 500 || busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}Assign {ids.length} {ids.length === 1 ? 'lead' : 'leads'}</button></div>;
  return <AgentDialog title="Assign leads to agent" description={`Choose a calling agent for ${ids.length} selected lead${ids.length === 1 ? '' : 's'}. Existing assignments are preserved.`} footer={footer} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <AgentField label="Search agents"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input aria-label="Search agents" className={`${inputClass} pl-9`} placeholder="Name or role…" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></AgentField>
        <AgentField label="Agent status"><select aria-label="Agent status" className={inputClass} value={availability} onChange={e => { setAvailability(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="paused">Paused</option></select></AgentField>
      </div>
      {agents.isLoading && <p role="status" className="text-sm text-slate-400">Loading agents…</p>}
      {agents.isError && <p role="alert" className="text-sm text-rose-300">Agents could not be loaded. <button className="underline" onClick={() => agents.refetch()}>Try again</button></p>}
      {agents.isSuccess && !agents.data.data.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">No agents match. Try another search or create a calling agent in AI Calling.</p>}
      <div role="radiogroup" aria-label="Choose calling agent" className="max-h-72 space-y-2 overflow-y-auto">{agents.data?.data.map(agent => <button key={agent._id} type="button" role="radio" aria-checked={selectedId === agent._id} aria-label={`Select ${agent.name}`} disabled={agent.availability === 'archived' || busy} onClick={() => { setSelectedId(agent._id); setError(null); }} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-40 ${selectedId === agent._id ? 'border-sky-400 bg-sky-400/10' : 'border-white/10 hover:border-sky-400/40'}`}><AgentAvatar name={agent.name} url={agent.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{agent.name}</span><span className="mt-1 block truncate text-xs text-slate-400">{agent.title || 'Calling agent'} · {agent.assignedLeadIds.length} assigned</span></span><StatusPill status={agent.availability} />{selectedId === agent._id && <Check className="h-4 w-4 shrink-0 text-sky-300" />}</button>)}</div>
      {agents.data && agents.data.pagination.pages > 1 && <div className="flex items-center justify-between gap-3 text-xs text-slate-400"><button className={secondaryClass} disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous agents</button><span>Page {page} of {agents.data.pagination.pages}</span><button className={secondaryClass} disabled={page >= agents.data.pagination.pages} onClick={() => setPage(value => value + 1)}>Next agents</button></div>}
      {selected.isError && <p role="alert" className="text-sm text-rose-300">This agent could not be loaded. <button className="underline" onClick={() => selected.refetch()}>Retry agent</button></p>}
      {selected.data && <div className="rounded-xl border border-sky-300/20 bg-sky-400/5 p-4 text-xs leading-relaxed text-slate-300"><p className="font-semibold text-slate-100">{selected.data.name}</p><p className="mt-2">{added} new · {ids.length - added} already assigned · {total} total after assignment</p>{total > 500 && <p role="alert" className="mt-2 text-amber-300">This would exceed the 500-lead limit. Select fewer leads or choose another agent.</p>}</div>}
      <p className="text-xs leading-relaxed text-slate-400">Assigning leads does not start calls or change running campaigns. Eligibility is checked when a new campaign starts.</p>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </div>
  </AgentDialog>;
}
