'use client';

import { useMemo, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Archive, ArrowRight, Bot, CheckCircle2, CircleAlert, Copy, MoreHorizontal, Plus, Search, Star } from 'lucide-react';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { showError } from '@/lib/toast';
import { useAgentMutations, useCallingAgents } from '@/modules/aiCalling/hooks/use-calling-agents';
import { AgentAvatar } from '@/modules/aiCalling/ui/calling-agent-primitives';
import { StatusPill } from '@/modules/aiCalling/ui/status-pill';
import type { CallingAgent } from '@/modules/aiCalling/types/ai-calling-types';
import { useInboundAnalytics, useInboundDevices, useInboundSettings, useSettingsMutations } from '../hooks/use-inbound-calls';
import { agentAssignments, errorMessage, filtersToQuery, isConflict, type T } from '../inbound-domain';
import { ConfirmAction, EmptyState, ErrorState, Pill, SkeletonBlocks, cardClass, inputClass, primaryClass, secondaryClass, selectClass } from './inbound-primitives';
import { IncomingAgentEditor } from './incoming-agent-editor';
import { useInboundLanguage } from './use-inbound-language';

const ALL_TIME = filtersToQuery({});

/** Receptionist agents (usage inbound or both) — the incoming-calls view of the AI Calling gallery. */
export function AgentsTab({ onOpenAgent }: { onOpenAgent: (id: string) => void }) {
  const { t } = useInboundLanguage();
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<CallingAgent | null>(null);
  const q = useDebounce(search.trim(), 300);
  const query = useCallingAgents({ usage: 'inbound', search: q, availability: availability || undefined, page, sort: 'name' });
  const settings = useInboundSettings();
  const devices = useInboundDevices();
  const analytics = useInboundAnalytics(ALL_TIME);
  const actions = useAgentMutations();
  const m = useSettingsMutations(t);
  const handled = useMemo(() => new Map((analytics.data?.byAgent ?? []).map((r) => [String(r.key), r])), [analytics.data]);
  const defaultId = settings.data?.defaultAgentId ? String(settings.data.defaultAgentId) : null;
  const fail = (e: unknown) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.')));

  const setDefault = (agent: CallingAgent) => {
    if (!settings.data) return;
    m.update.mutate({ defaultAgentId: agent._id, version: settings.data.version }, {
      onError: (e) => { if (isConflict(e)) void m.reload(); fail(e); },
    });
  };
  const archive = async () => {
    if (!archiving) return;
    try { await actions.update.mutateAsync({ id: archiving._id, version: archiving.version, availability: 'archived' }); setArchiving(null); } catch { /* the mutation shows the error */ }
  };
  const duplicate = async (agent: CallingAgent) => {
    try { const copy = await actions.duplicate.mutateAsync(agent._id); onOpenAgent(copy._id); } catch { /* the mutation shows the error */ }
  };

  const agents = query.data?.data ?? [];
  const filtered = Boolean(search || availability);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{t('inbound.agents.title', 'Receptionist agents')}</h2><p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('inbound.agents.hint', 'The AI agents that answer calls to your connected phones. Each has its own voice, greeting and instructions.')}</p></div>
        <button type="button" className={primaryClass} onClick={() => setCreating(true)}><Plus className="size-4" />{t('inbound.agents.create', 'Create incoming agent')}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" /><input aria-label={t('inbound.agents.search', 'Search agents')} className={`${inputClass} ps-9`} placeholder={t('inbound.agents.search', 'Search agents')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <select aria-label={t('inbound.agents.availability', 'Availability')} className={`${selectClass} h-11`} value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1); }}>
          <option value="">{t('inbound.agents.allStates', 'All states')}</option>
          {(['active', 'draft', 'paused', 'archived'] as const).map((a) => <option key={a} value={a}>{t(`inbound.agentAvailability.${a}`, a)}</option>)}
        </select>
      </div>

      {query.isLoading ? <SkeletonBlocks count={3} className="h-40" label={t('inbound.common.loading', 'Loading…')} />
        : query.isError ? <div className={cardClass}><ErrorState t={t} onRetry={() => query.refetch()} /></div>
          : !agents.length ? <div className={cardClass}><EmptyState icon={Bot} title={filtered ? t('inbound.agents.noMatch', 'No agents match') : t('inbound.agents.empty', 'No incoming agents yet')} hint={filtered ? t('inbound.agents.noMatchHint', 'Change the search or availability filter.') : t('inbound.agents.emptyHint', 'Create a receptionist to answer calls on your connected phone.')} action={!filtered ? <button type="button" className={primaryClass} onClick={() => setCreating(true)}><Plus className="size-4" />{t('inbound.agents.create', 'Create incoming agent')}</button> : undefined} /></div>
            : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agents.map((agent) => (
                  <AgentCard key={agent._id} agent={agent} t={t} isDefault={defaultId === agent._id}
                    assignments={agentAssignments(agent._id, settings.data?.deviceAgents ?? [], devices.data ?? [])}
                    calls={handled.get(agent._id)?.count ?? 0} answered={handled.get(agent._id)?.answered ?? 0}
                    busy={m.update.isPending || actions.update.isPending || actions.duplicate.isPending}
                    onOpen={() => onOpenAgent(agent._id)} onDefault={() => setDefault(agent)} onDuplicate={() => void duplicate(agent)} onArchive={() => setArchiving(agent)} />
                ))}
              </div>
            )}
      {query.data && query.data.pagination.pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button type="button" className={secondaryClass} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('inbound.history.prev', 'Previous page')}</button>
          <span>{t('inbound.agents.page', 'Page {page} of {pages}', { page, pages: query.data.pagination.pages })}</span>
          <button type="button" className={secondaryClass} disabled={page >= query.data.pagination.pages} onClick={() => setPage((p) => p + 1)}>{t('inbound.history.next', 'Next page')}</button>
        </div>
      ) : null}

      {creating ? <IncomingAgentEditor settings={settings.data ?? null} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpenAgent(id); }} /> : null}
      {archiving ? <ConfirmAction danger title={t('inbound.agents.archiveTitle', 'Archive {name}?', { name: archiving.name })}
        description={defaultId === archiving._id ? t('inbound.agents.archiveDefaultHint', 'This is your default incoming agent. After archiving, calls without another assigned agent are not answered by the AI until you choose a new default.') : t('inbound.agents.archiveHint', 'Archived agents no longer answer calls. Past calls and analytics are kept.')}
        confirmLabel={t('inbound.agents.archive', 'Archive')} cancelLabel={t('inbound.common.cancel', 'Cancel')} busy={actions.update.isPending} onClose={() => setArchiving(null)} onConfirm={() => void archive()} /> : null}
    </div>
  );
}

function AgentCard({ agent, t, isDefault, assignments, calls, answered, busy, onOpen, onDefault, onDuplicate, onArchive }: {
  agent: CallingAgent; t: T; isDefault: boolean; assignments: string[]; calls: number; answered: number; busy: boolean;
  onOpen: () => void; onDefault: () => void; onDuplicate: () => void; onArchive: () => void;
}) {
  const archived = agent.availability === 'archived';
  return (
    <article aria-label={agent.name} className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:border-sky-400/30">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-start" aria-label={t('inbound.agents.openNamed', 'Open {name}', { name: agent.name })}>
          <AgentAvatar name={agent.name} url={agent.avatarUrl} />
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{agent.name}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{agent.title || t('inbound.agents.receptionist', 'Receptionist')}</span></span>
        </button>
        <span className="flex shrink-0 flex-col items-end gap-1"><StatusPill status={agent.availability} />{isDefault ? <Pill tone="live"><Star className="size-3" />{t('inbound.agents.default', 'Default agent')}</Pill> : null}</span>
      </div>
      <p className="mb-3 mt-4 line-clamp-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{agent.description || agent.inbound?.greeting || t('inbound.agents.noDescription', 'No description yet.')}</p>
      <dl className="grid grid-cols-2 gap-3 border-y border-border py-3 text-xs">
        <div className="min-w-0"><dt className="text-[10px] text-muted-foreground">{t('inbound.agents.handled', 'Incoming calls handled')}</dt><dd className="mt-1 font-semibold tabular-nums">{calls}{calls ? <span className="ms-1 font-normal text-muted-foreground">({t('inbound.analytics.aiAnswered', '{count} by AI', { count: answered })})</span> : null}</dd></div>
        <div className="min-w-0"><dt className="text-[10px] text-muted-foreground">{t('inbound.agents.phones', 'Phones and SIMs')}</dt><dd className="mt-1 truncate" title={assignments.join(', ')}>{assignments.length ? assignments.join(', ') : isDefault ? t('inbound.agents.allUnassigned', 'Every phone without its own agent') : t('inbound.agents.notAssigned', 'Not assigned')}</dd></div>
      </dl>
      <p className={`mt-3 flex items-start gap-1.5 text-[11px] ${agent.readiness.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
        {agent.readiness.ready ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <CircleAlert className="mt-px size-3.5 shrink-0" />}
        <span className="line-clamp-2">{agent.readiness.ready ? t('inbound.agents.ready', 'Ready to answer calls') : t('inbound.agents.missing', 'Complete: {list}', { list: agent.readiness.missing.join(', ') })}</span>
      </p>
      <div className="mt-auto flex gap-2 pt-4">
        {!isDefault && !archived ? <button type="button" className={`${secondaryClass} min-w-0 flex-1 px-2 text-xs`} disabled={busy} onClick={onDefault}><Star className="size-3.5" />{t('inbound.agents.setDefault', 'Set as default')}</button> : null}
        <button type="button" className={`${primaryClass} min-w-0 flex-1 px-2 text-xs`} onClick={onOpen}>{t('inbound.agents.open', 'Open')}<ArrowRight className="size-3 rtl:rotate-180" /></button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label={t('inbound.agents.actionsNamed', 'Actions for {name}', { name: agent.name })} className={`${secondaryClass} px-2`}><MoreHorizontal className="size-4" /></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="z-40 min-w-44 rounded-xl border border-border bg-card p-1 text-xs text-foreground shadow-xl">
              <DropdownMenu.Item disabled={busy} onSelect={onDuplicate} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-muted"><Copy className="size-3.5" />{t('inbound.agents.duplicate', 'Duplicate')}</DropdownMenu.Item>
              <DropdownMenu.Item disabled={busy || archived} onSelect={onArchive} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-muted"><Archive className="size-3.5" />{t('inbound.agents.archive', 'Archive')}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </article>
  );
}
