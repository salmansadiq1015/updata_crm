'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, FilterX, Loader2, MoreHorizontal, PhoneIncoming, Search, StickyNote } from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useAssignableAgents, useAssignableUsers, useInboundCall, useInboundDevices, useInboundList, useRowFollowUp, useRowNote } from '../hooks/use-inbound-calls';
import { inboundCallsApi } from '../services/inbound-calls-api';
import {
  activeFilterCount, callerDisplay, canCreateLeadFor, deviceSimLabel, leadCandidates, enumLabel, errorMessage, filtersToQuery, formatDateTime, formatDuration, reportedSimOptions, rowsToCsv,
  type T,
} from '../inbound-domain';
import {
  HANDLED_BY, INQUIRY_CATEGORIES, LIST_CALLER_TYPES, OUTCOMES, QUALIFICATION_RESULTS, WORK_STATUSES,
  type InboundCallRow, type InboundFilters, type InboundSort,
} from '../types/inbound-call-types';
import { CallerTypeBadge, CallStatusPill, EmptyState, ErrorState, FollowUpDialog, NoteDialog, Pill, QualificationPill, SkeletonBlocks, WorkPill, cardClass, secondaryClass, selectClass, type FollowUpSubmit } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

const EMPTY: InboundFilters = { search: '', from: '', to: '', handledBy: '', callerType: '', simSlot: '', outcome: '', qualification: '', inquiry: '', agentId: '', deviceId: '', leadCreated: false, workStatus: '', assignedTo: '' };

export function HistoryTab({ onOpenCall, initialFilters }: { onOpenCall: (id: string) => void; initialFilters?: Partial<InboundFilters> }) {
  const { t, intlLocale } = useInboundLanguage();
  const [filters, setFilters] = useState<InboundFilters>(() => ({ ...EMPTY, ...initialFilters }));
  const [sort, setSort] = useState<InboundSort>('newest');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Map<string, InboundCallRow>>(new Map());
  const [exporting, setExporting] = useState(false);
  const [noteFor, setNoteFor] = useState<InboundCallRow | null>(null);
  const [followUpFor, setFollowUpFor] = useState<InboundCallRow | null>(null);
  const search = useDebounce(filters.search ?? '', 300);
  const effective = useMemo(() => ({ ...filters, search }), [filters, search]);
  const params = useMemo(() => filtersToQuery(effective, { page, limit, sort }), [effective, page, limit, sort]);
  const query = useInboundList(params);
  const agents = useAssignableAgents();
  const { users } = useAssignableUsers();
  const userName = (id?: string | null) => (id ? users.find((u) => u.id === id)?.name ?? '—' : '');
  const devices = useInboundDevices();
  const note = useRowNote(t);
  const followUp = useRowFollowUp(t);
  const rows = query.data?.data ?? [];
  const simOptions = reportedSimOptions(devices.data);
  const pagination = query.data?.pagination;
  const filterCount = activeFilterCount(filters);

  const set = (patch: Partial<InboundFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((prev) => { const next = new Map(prev); if (allOnPage) rows.forEach((r) => next.delete(r.id)); else rows.forEach((r) => next.set(r.id, r)); return next; });
  const toggle = (row: InboundCallRow) => setSelected((prev) => { const next = new Map(prev); if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row); return next; });

  async function exportFiltered() {
    setExporting(true);
    try {
      const { page: _p, limit: _l, sort: _s, ...rest } = params;
      const blob = await inboundCallsApi.exportCsv(rest);
      downloadBlob(blob, `incoming-calls-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    } catch (e) { showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))); } finally { setExporting(false); }
  }
  async function exportSelected() {
    const ids = [...selected.keys()];
    if (!ids.length) return;
    setExporting(true);
    try {
      // Server export (all columns, incl. caller fields + summary) for up to 500 ids; larger
      // selections fall back to the in-browser CSV of the visible columns.
      const blob = ids.length <= 500 ? await inboundCallsApi.exportCsv({ ids: ids.join(',') }) : new Blob([rowsToCsv([...selected.values()], t)], { type: 'text/csv;charset=utf-8' });
      downloadBlob(blob, `incoming-calls-selected-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    } catch (e) { showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))); } finally { setExporting(false); }
  }

  const opt = (kind: Parameters<typeof enumLabel>[1], values: readonly string[]) => values.map((v) => <option key={v} value={v}>{enumLabel(t, kind, v)}</option>);

  return (
    <section aria-labelledby="inbound-history-title" className={`${cardClass} overflow-hidden`}>
      <header className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="inbound-history-title" className="text-sm font-semibold">{t('inbound.history.title', 'Call history')}</h2><p className="text-[11px] text-muted-foreground">{t('inbound.history.subtitle', 'Every incoming call on your connected phones. Open a row for the transcript and caller details.')}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">{t('inbound.history.sort', 'Sort')}
              <select className={selectClass} value={sort} onChange={(e) => { setSort(e.target.value as InboundSort); setPage(1); }}>
                <option value="newest">{t('inbound.history.sortNewest', 'Newest first')}</option><option value="oldest">{t('inbound.history.sortOldest', 'Oldest first')}</option><option value="longest">{t('inbound.history.sortLongest', 'Longest first')}</option>
              </select>
            </label>
            <button type="button" className={`${secondaryClass} h-9 min-h-0 px-3 text-xs`} disabled={exporting} onClick={() => void exportFiltered()}>{exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{t('inbound.history.export', 'Export CSV')}</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <span className="sr-only">{t('inbound.history.search', 'Search calls')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder={t('inbound.history.searchHint', 'Name, number, agent or summary')} className="h-9 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-xs outline-none focus:border-sky-400/60" />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">{t('inbound.range.from', 'From')}<input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className={selectClass} /></label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">{t('inbound.range.to', 'To')}<input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className={selectClass} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label={t('inbound.filter.handledBy', 'Answered by')} value={filters.handledBy ?? ''} onChange={(v) => set({ handledBy: v as InboundFilters['handledBy'] })} all={t('inbound.filter.anyone', 'Anyone')}>{opt('handledBy', HANDLED_BY)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.callerType', 'Caller')} value={filters.callerType ?? ''} onChange={(v) => set({ callerType: v as InboundFilters['callerType'] })} all={t('inbound.filter.allCallers', 'All callers')}>{opt('callerType', LIST_CALLER_TYPES)}</FilterSelect>
          {simOptions.length ? <FilterSelect label={t('inbound.filter.sim', 'SIM')} value={filters.simSlot ?? ''} onChange={(v) => set({ simSlot: v })} all={t('inbound.filter.allSims', 'All SIMs')}>{simOptions.map((o) => <option key={o.slot} value={String(o.slot)}>{o.label}</option>)}</FilterSelect> : null}
          <FilterSelect label={t('inbound.filter.outcome', 'Outcome')} value={filters.outcome ?? ''} onChange={(v) => set({ outcome: v as InboundFilters['outcome'] })} all={t('inbound.filter.allOutcomes', 'All outcomes')}>{opt('outcome', OUTCOMES)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.qualification', 'Qualification')} value={filters.qualification ?? ''} onChange={(v) => set({ qualification: v as InboundFilters['qualification'] })} all={t('inbound.filter.allQualifications', 'Any qualification')}>{opt('qualification', QUALIFICATION_RESULTS)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.inquiry', 'Inquiry')} value={filters.inquiry ?? ''} onChange={(v) => set({ inquiry: v as InboundFilters['inquiry'] })} all={t('inbound.filter.allInquiries', 'Any inquiry')}>{opt('inquiry', INQUIRY_CATEGORIES)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.agent', 'Agent')} value={filters.agentId ?? ''} onChange={(v) => set({ agentId: v })} all={t('inbound.filter.allAgents', 'All agents')}>{agents.agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.workStatus', 'Status')} value={filters.workStatus ?? ''} onChange={(v) => set({ workStatus: v })} all={t('inbound.filter.anyStatus', 'Any status')}><option value="open">{t('inbound.filter.open', 'Open (needs work)')}</option>{WORK_STATUSES.map((w) => <option key={w} value={w}>{enumLabel(t, 'work', w)}</option>)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.assignee', 'Assigned to')} value={filters.assignedTo ?? ''} onChange={(v) => set({ assignedTo: v })} all={t('inbound.filter.anyone', 'Anyone')}><option value="me">{t('inbound.filter.me', 'Me')}</option><option value="none">{t('inbound.work.unassigned', 'Unassigned')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</FilterSelect>
          <FilterSelect label={t('inbound.filter.device', 'Phone')} value={filters.deviceId ?? ''} onChange={(v) => set({ deviceId: v })} all={t('inbound.filter.allDevices', 'All phones')}>{(devices.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</FilterSelect>
          <button type="button" aria-pressed={Boolean(filters.leadCreated)} onClick={() => set({ leadCreated: !filters.leadCreated })} className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium ${filters.leadCreated ? 'border-sky-400/50 bg-sky-400/10 text-sky-700 dark:text-sky-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>{t('inbound.filter.newLeads', 'New leads only')}</button>
          {filterCount ? <button type="button" className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setFilters(EMPTY); setPage(1); }}><FilterX className="size-3.5" />{t('inbound.filter.clear', 'Clear filters ({count})', { count: filterCount })}</button> : null}
        </div>
      </header>

      {selected.size ? (
        <div role="region" aria-label={t('inbound.history.bulk', 'Selected calls')} className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-4 py-2 text-xs">
          <span className="font-medium">{t('inbound.history.selected', '{count} selected', { count: selected.size })}</span>
          <button type="button" className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`} onClick={exportSelected}><Download className="size-3.5" />{t('inbound.history.exportSelected', 'Export selected')}</button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Map())}>{t('inbound.history.clearSelection', 'Clear selection')}</button>
        </div>
      ) : null}

      {query.isLoading && !query.data ? <div className="p-4"><SkeletonBlocks count={6} className="h-11" label={t('inbound.common.loading', 'Loading…')} /></div>
        : query.isError && !query.data ? <ErrorState t={t} onRetry={() => query.refetch()} />
          : !rows.length ? <EmptyState icon={PhoneIncoming} title={filterCount ? t('inbound.history.noMatch', 'No calls match these filters') : t('inbound.history.empty', 'No incoming calls yet')} hint={filterCount ? t('inbound.history.noMatchHint', 'Change or clear the filters to see other calls.') : t('inbound.history.emptyHint', 'Calls to your connected phones will be listed here.')} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-start text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                      <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label={t('inbound.history.selectPage', 'Select all calls on this page')} checked={allOnPage} onChange={toggleAll} /></th>
                      {['caller', 'number', 'lead', 'work', 'status', 'answeredBy', 'agent', 'sim', 'duration', 'inquiry', 'qualification', 'date'].map((c) => <th key={c} className={`px-3 py-2.5 text-start ${c === 'duration' ? 'text-end' : ''}`}>{t(`inbound.col.${c}`, c)}</th>)}
                      <th className="px-3 py-2.5"><span className="sr-only">{t('inbound.col.actions', 'Actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-border text-muted-foreground last:border-0 hover:bg-sky-400/[.04]">
                        <td className="px-3 py-2.5"><input type="checkbox" aria-label={t('inbound.history.selectRow', 'Select call from {caller}', { caller: callerDisplay(row, t) })} checked={selected.has(row.id)} onChange={() => toggle(row)} /></td>
                        <td className="max-w-48 px-3 py-2.5"><button type="button" onClick={() => onOpenCall(row.id)} className="block max-w-full truncate text-start font-semibold text-foreground hover:text-primary">{callerDisplay(row, t)}</button><CallerTypeBadge type={row.callerType} t={t} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono">{row.caller.number || '—'}</td>
                        <td className="max-w-40 truncate px-3 py-2.5">{row.lead ? <Link className="text-primary hover:underline" href={`/leads?detail=${row.lead.id}`}>{row.lead.name || row.lead.number}</Link> : '—'}</td>
                        <td className="px-3 py-2.5"><WorkPill value={row.workStatus} source={row.workSource} t={t} />{row.assignedTo ? <span className="mt-1 block max-w-32 truncate text-[10px] text-muted-foreground" title={userName(row.assignedTo)}>{userName(row.assignedTo)}</span> : null}</td>
                        <td className="px-3 py-2.5"><CallStatusPill status={row.status} t={t} />{row.aiBlockedBy === 'call_waiting' ? <span className="mt-1 block"><Pill tone="warning" title={enumLabel(t, 'reason', 'call_waiting')}>{t('inbound.callWaiting.short', 'Call waiting')}</Pill></span> : null}</td>
                        <td className="px-3 py-2.5">{enumLabel(t, 'handledBy', row.answeredBy ?? 'none')}</td>
                        <td className="max-w-32 truncate px-3 py-2.5">{row.agent?.name || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{deviceSimLabel(devices.data, row.device?.id, row.sim.slot, row.sim.label)}</td>
                        <td className="px-3 py-2.5 text-end font-mono tabular-nums">{formatDuration(row.durationSeconds)}</td>
                        <td className="max-w-36 truncate px-3 py-2.5">{enumLabel(t, 'inquiry', row.primaryInquiry)}</td>
                        <td className="px-3 py-2.5"><QualificationPill value={row.qualification} t={t} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5">{formatDateTime(row.detectedAt, intlLocale)}</td>
                        <td className="px-3 py-2.5 text-end">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger aria-label={t('inbound.history.rowActions', 'Actions for {caller}', { caller: callerDisplay(row, t) })} className="rounded-lg p-1.5 hover:bg-muted"><MoreHorizontal className="size-4" /></DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content align="end" className="z-40 min-w-48 rounded-xl border border-border bg-card p-1 text-xs text-foreground shadow-xl">
                                <MenuItem icon={Eye} label={t('inbound.history.openDetails', 'Open details')} onSelect={() => onOpenCall(row.id)} />
                                {row.lead ? <DropdownMenu.Item asChild><Link href={`/leads?detail=${row.lead.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-muted"><ExternalLink className="size-3.5" />{t('inbound.history.openLead', 'Open lead')}</Link></DropdownMenu.Item> : null}
                                <MenuItem icon={StickyNote} label={t('inbound.history.addNote', 'Add note')} onSelect={() => setNoteFor(row)} />
                                <MenuItem icon={CalendarPlus} label={t('inbound.history.followUp', 'Schedule follow-up')} onSelect={() => setFollowUpFor(row)} />
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

      {pagination && pagination.total > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span>{t('inbound.history.pageInfo', '{total} calls · page {page} of {pages}', { total: pagination.total, page: pagination.page, pages: Math.max(1, pagination.pages) })}{query.isFetching ? ` · ${t('inbound.common.updating', 'updating…')}` : ''}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">{t('inbound.history.perPage', 'Per page')}<select className={selectClass} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <button type="button" aria-label={t('inbound.history.prev', 'Previous page')} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-muted/50 disabled:opacity-30"><ChevronLeft className="size-4 rtl:rotate-180" /></button>
            <button type="button" aria-label={t('inbound.history.next', 'Next page')} disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="inline-flex size-8 items-center justify-center rounded-lg border border-border hover:bg-muted/50 disabled:opacity-30"><ChevronRight className="size-4 rtl:rotate-180" /></button>
          </div>
        </footer>
      ) : null}

      {noteFor ? <NoteDialog t={t} busy={note.isPending} onClose={() => setNoteFor(null)} onSubmit={(text) => note.mutate({ id: noteFor.id, text }, { onSuccess: () => setNoteFor(null) })} /> : null}
      {followUpFor ? <RowFollowUp row={followUpFor} t={t} busy={followUp.isPending} onClose={() => setFollowUpFor(null)} onSubmit={(v) => followUp.mutate({ id: followUpFor.id, ...v }, { onSuccess: () => setFollowUpFor(null) })} /> : null}
    </section>
  );
}

/** A row has no match candidates: load the call so a lead-less follow-up can offer them. */
function RowFollowUp({ row, t, busy, onClose, onSubmit }: { row: InboundCallRow; t: T; busy: boolean; onClose: () => void; onSubmit: (v: FollowUpSubmit) => void }) {
  const detail = useInboundCall(row.lead ? null : row.id);
  if (!row.lead && detail.isLoading) return null;
  const call = detail.data;
  return <FollowUpDialog t={t} hasLead={Boolean(row.lead ?? call?.lead)} candidates={call ? leadCandidates(call) : []} canCreate={call ? canCreateLeadFor(call) : canCreateLeadFor(row)} busy={busy} onClose={onClose} onSubmit={onSubmit} />;
}

function FilterSelect({ label, value, onChange, all, children }: { label: string; value: string; onChange: (v: string) => void; all: string; children: ReactNode }) {
  return <label className="min-w-0"><span className="sr-only">{label}</span><select aria-label={label} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{all}</option>{children}</select></label>;
}

function MenuItem({ icon: Icon, label, onSelect }: { icon: typeof Eye; label: string; onSelect: () => void }) {
  return <DropdownMenu.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-muted"><Icon className="size-3.5" />{label}</DropdownMenu.Item>;
}
