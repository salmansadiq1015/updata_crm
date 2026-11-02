'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight, CheckSquare, ChevronRight, Clock3, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, Search, Square, Star, Tag, X,
} from 'lucide-react';
import { Fragment } from 'react';
import { leadApi } from '@/modules/leads/services/lead-api';
import type { Lead, LeadStatus, LeadSource, LeadFilters } from '@/modules/leads/types/lead-types';
import { LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_SOURCES, LEAD_SOURCE_LABEL } from '@/modules/leads/ui/lead-ui-constants';
import { LEAD_STATUS_META } from '@/modules/leads/ui/status-badge';
import {
  getAddressLines, getLeadBusinessTypeLabel, getLeadLocationLine, getOpeningHoursLines, getWebsiteLabel, toSafeWebUrl,
} from '@/modules/leads/ui/lead-ui-utils';
import { useDebounce } from '@/shared/hooks/use-debounce';

/** One campaign enrols at most this many hand-picked leads. */
export const MAX_CAMPAIGN_LEADS = 500;

/** Why a lead can't be called/texted, in plain words (matches the server's eligibility reason codes). */
export const ELIGIBILITY_REASON_TEXT: Record<string, string> = {
  missing_phone: 'No valid phone number',
  suppressed: 'On the do-not-call / suppression list',
  consent_required: 'Call consent not recorded',
  consent_expired: 'Call consent expired',
  consent_revoked: 'Call consent revoked',
  duplicate_phone: 'Duplicate phone number',
  lead_unavailable: 'Lead no longer available',
};

const CONSENT_REASONS = new Set(['consent_required', 'consent_expired', 'consent_revoked']);
/** Open a lead's detail (where call consent is recorded, under AI Calls). */
export const leadDetailHref = (leadId: string) => `/leads?detail=${encodeURIComponent(leadId)}`;

/**
 * Why a recipient is ineligible, as an amber line. A consent reason becomes a link that
 * opens the lead (new tab) so consent can be recorded there, instead of a dead label.
 */
export function RecipientReasons({ leadId, reasons }: { leadId?: string | null; reasons: string[] }) {
  if (!reasons.length) return null;
  return (
    <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
      {reasons.map((code, i) => {
        const label = ELIGIBILITY_REASON_TEXT[code] || code;
        const linked = CONSENT_REASONS.has(code) && leadId;
        return (
          <Fragment key={code}>
            {i > 0 ? ' · ' : ''}
            {linked ? (
              <a
                href={leadDetailHref(leadId as string)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Open the lead to record call consent"
                className="inline-flex items-center gap-0.5 font-semibold underline decoration-dotted underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300"
              >
                {label} — record consent<ArrowUpRight className="h-3 w-3" />
              </a>
            ) : label}
          </Fragment>
        );
      })}
    </div>
  );
}

/** How to clear each blocking reason, for the pre-save warning. */
export const ELIGIBILITY_FIX_TEXT: Record<string, string> = {
  missing_phone: 'add a phone number to the lead',
  suppressed: 'these are on the do-not-call list and cannot be contacted',
  consent_required: 'open each lead’s AI Calls tab and Record verified consent',
  consent_expired: 'consent has expired — record it again on each lead’s AI Calls tab',
  consent_revoked: 'consent was revoked — these cannot be called',
  duplicate_phone: 'remove the duplicate, or give each lead its own number',
  lead_unavailable: 'these leads were deleted or converted',
};
const PAGE_SIZE = 50;
const BULK_PAGE_SIZE = 100; // the leads API caps a page at 100

/** A lead the campaign can reach: calls and SMS both need a number. */
export const isReachable = (lead: Pick<Lead, 'phone' | 'mobile'>) => Boolean(lead.mobile || lead.phone);

/** Recipient states that are mid-call — these cannot be removed (the server enforces it too). */
export const RECIPIENT_ACTIVE_STATES = new Set(['dialing', 'in_progress', 'processing']);
export const isRecipientRemovable = (state: string): boolean => !RECIPIENT_ACTIVE_STATES.has(state);

function StatusPill({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_META[status] ?? LEAD_STATUS_META.new;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.pill}`}>
      {LEAD_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Pick the leads a calling / SMS-link campaign enrols: search and page through the
 * real lead list, tick up to 500, and open any lead to see everything on record
 * for it before choosing. Leads without a phone number cannot be reached and are
 * shown but not selectable.
 */
export function CampaignLeadPicker({ selected, onChange, verb = 'call', purpose = 'campaign', onBusyChange }: {
  selected: Map<string, Lead>;
  onChange: (next: Map<string, Lead>) => void;
  verb?: 'call' | 'text';
  purpose?: 'campaign' | 'assignment';
  onBusyChange?: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [extraFilters, setExtraFilters] = useState<Pick<LeadFilters, 'type' | 'countryId' | 'cityId' | 'areaId' | 'businessType'>>({});
  const [onlySelected, setOnlySelected] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const q = useDebounce(search.trim(), 300);
  const filters = useMemo(() => ({ q: q || undefined, status: status || undefined, source: source || undefined, ...extraFilters }), [q, status, source, extraFilters]);
  const facets = useQuery({ queryKey: ['ai-calling', 'lead-picker-facets', filters], queryFn: () => leadApi.getFilterOptions({ q: filters.q, status: filters.status, source: filters.source, type: filters.type, countryId: filters.countryId, cityId: filters.cityId, businessType: filters.businessType }), enabled: purpose === 'assignment' });

  const list = useInfiniteQuery({
    queryKey: ['ai-calling', 'lead-picker', filters],
    queryFn: ({ pageParam }) => leadApi.listLeads({ ...filters, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasNext ? last.pagination.nextCursor : undefined),
    enabled: !onlySelected,
  });
  const loaded = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.pagination.total;
  const rows = onlySelected ? [...selected.values()] : loaded;
  const room = MAX_CAMPAIGN_LEADS - selected.size;
  const full = room <= 0;

  const toggle = (lead: Lead) => {
    const next = new Map(selected);
    if (next.has(lead.id)) next.delete(lead.id);
    else if (!full && (purpose === 'assignment' || isReachable(lead))) next.set(lead.id, lead);
    onChange(next);
  };

  /** Add reachable leads in order until the cap; returns how many were added. */
  const addAll = (leads: Lead[], next: Map<string, Lead>) => {
    let added = 0;
    for (const lead of leads) {
      if (next.size >= MAX_CAMPAIGN_LEADS) break;
      if ((purpose !== 'assignment' && !isReachable(lead)) || next.has(lead.id)) continue;
      next.set(lead.id, lead);
      added += 1;
    }
    return added;
  };

  const selectLoaded = () => {
    const next = new Map(selected);
    const added = addAll(loaded, next);
    onChange(next);
    setBulk({ busy: false, note: next.size >= MAX_CAMPAIGN_LEADS ? `Limit reached: ${MAX_CAMPAIGN_LEADS} leads per campaign.` : `Added ${added} lead${added === 1 ? '' : 's'}.` });
  };

  // Page through every match (not just the rows on screen) until the cap.
  const selectAllMatching = async () => {
    setBulk({ busy: true, note: null });
    onBusyChange?.(true);
    const next = new Map(selected);
    let added = 0;
    let cursor: string | null = null;
    try {
      do {
        const page = await leadApi.listLeads({ ...filters, limit: BULK_PAGE_SIZE, cursor });
        added += addAll(page.data, next);
        cursor = page.pagination.hasNext ? page.pagination.nextCursor : null;
      } while (cursor && next.size < MAX_CAMPAIGN_LEADS);
      onChange(next);
      setBulk({ busy: false, note: next.size >= MAX_CAMPAIGN_LEADS && cursor ? `Added ${added}; stopped at the ${MAX_CAMPAIGN_LEADS}-lead limit.` : `Added ${added} matching lead${added === 1 ? '' : 's'}${purpose === 'assignment' ? '' : ' with a phone number'}.` });
    } catch {
      onChange(next);
      setBulk({ busy: false, note: `Leads could not be loaded completely; ${added} were added. Try again.` });
    } finally { onBusyChange?.(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            aria-label="Search leads"
            className="w-full rounded-lg border border-border bg-background py-2 ps-9 pe-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            placeholder="Search by name, phone, email…"
            value={search}
            maxLength={100}
            onChange={(e) => { setSearch(e.target.value); setOnlySelected(false); }}
          />
        </div>
        <select
          aria-label="Lead status"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value as LeadStatus | ''); setOnlySelected(false); }}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Lead source" value={source} onChange={e => { setSource(e.target.value as LeadSource | ''); setOnlySelected(false); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">All sources</option>{LEAD_SOURCES.map(value => <option key={value} value={value}>{LEAD_SOURCE_LABEL[value]}</option>)}</select>
      </div>

      {purpose === 'assignment' && <fieldset className="rounded-xl border border-border bg-muted/20 p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">More lead filters</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ['type', 'Lead type', [['business', 'Business'], ['private', 'Private']]],
            ['businessType', 'Business type', facets.data?.businessTypes.map(option => [option.value, option.value]) || []],
            ['countryId', 'Country', facets.data?.countries.map(option => [option.id, option.value]) || []],
            ['cityId', 'City', facets.data?.cities.map(option => [option.id, option.value]) || []],
            ['areaId', 'Area', facets.data?.areas.map(option => [option.id, option.value]) || []],
          ] as Array<[keyof typeof extraFilters, string, string[][]]>).map(([key, label, options]) => <label key={key} className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground">{label}<select aria-label={label} value={extraFilters[key] || ''} onChange={e => { setOnlySelected(false); setExtraFilters(current => ({ ...current, [key]: e.target.value || undefined, ...(key === 'countryId' ? { cityId: undefined, areaId: undefined } : key === 'cityId' ? { areaId: undefined } : {}) })); }} className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2.5 text-sm text-foreground"><option value="">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        </div>
        {facets.isError && <p role="alert" className="mt-2 text-xs text-amber-500">Filter options could not be loaded. <button type="button" className="underline" onClick={() => facets.refetch()}>Retry filters</button></p>}
        <button type="button" onClick={() => { setSearch(''); setStatus(''); setSource(''); setExtraFilters({}); setOnlySelected(false); }} className="mt-3 text-xs text-brand-500 hover:underline">Reset filters</button>
      </fieldset>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 font-semibold tabular-nums ${full ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'}`} aria-live="polite">
            {selected.size} / {MAX_CAMPAIGN_LEADS} selected
          </span>
          {total !== undefined && !onlySelected ? <span className="text-muted-foreground">{total} matching</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={selectLoaded} disabled={full || !loaded.length || onlySelected} className="rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-40 dark:text-brand-300">Select shown</button>
          <button type="button" onClick={() => void selectAllMatching()} disabled={full || bulk.busy || onlySelected} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-500/10 disabled:opacity-40 dark:text-brand-300">
            {bulk.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Select all matching
          </button>
          <button type="button" onClick={() => setOnlySelected((v) => !v)} disabled={!selected.size && !onlySelected} aria-pressed={onlySelected} className={`rounded-md px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 ${onlySelected ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>Show selected</button>
          <button type="button" onClick={() => { onChange(new Map()); setOnlySelected(false); setBulk({ busy: false, note: null }); }} disabled={!selected.size} className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted disabled:opacity-40">Clear</button>
        </div>
      </div>
      {bulk.note ? <p className="text-xs text-muted-foreground" role="status">{bulk.note}</p> : null}

      <div className={`grid gap-3 ${openId ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border" role="list" aria-label="Leads">
          {list.isLoading && !onlySelected ? <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : null}
          {list.isError && !onlySelected ? <p className="p-4 text-sm text-rose-600 dark:text-rose-400">Leads could not be loaded. Check your connection and try again.</p> : null}
          {!list.isLoading && !rows.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{onlySelected ? 'No leads selected yet.' : 'No leads match this search.'}</p>
          ) : null}
          {rows.map((lead) => {
            const checked = selected.has(lead.id);
            const reachable = isReachable(lead);
            const disabled = !checked && ((purpose !== 'assignment' && !reachable) || full);
            const location = getLeadLocationLine(lead.address);
            const type = getLeadBusinessTypeLabel(lead);
            return (
              <div key={lead.id} role="listitem" className={`flex items-center gap-3 border-b border-border px-3 py-2 last:border-0 ${openId === lead.id ? 'bg-brand-500/5' : 'hover:bg-muted/40'}`}>
                <input
                  type="checkbox"
                  aria-label={`Select ${lead.name}`}
                  className="h-4 w-4 shrink-0 accent-brand-500"
                  checked={checked}
                  disabled={disabled}
                  title={purpose !== 'assignment' && !reachable ? 'No phone number' : full && !checked ? `Limit of ${MAX_CAMPAIGN_LEADS} leads reached` : undefined}
                  onChange={() => toggle(lead)}
                />
                <button type="button" onClick={() => setOpenId(openId === lead.id ? null : lead.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-label={`Show details for ${lead.name}`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${reachable ? '' : 'text-muted-foreground'}`}>{lead.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[lead.mobile || lead.phone || 'No phone number', type, location].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusPill status={lead.status} />
                  <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition ${openId === lead.id ? 'rotate-90 lg:rotate-0' : ''}`} />
                </button>
              </div>
            );
          })}
          {!onlySelected && list.hasNextPage ? (
            <button type="button" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="flex w-full items-center justify-center gap-2 py-2 text-xs font-medium text-brand-600 hover:bg-muted/40 dark:text-brand-300">
              {list.isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Load more leads
            </button>
          ) : null}
        </div>

        {openId ? (
          <LeadDetailPanel
            leadId={openId}
            fallback={rows.find((l) => l.id === openId) ?? selected.get(openId) ?? null}
            selected={selected.has(openId)}
            canSelect={!full}
            verb={verb}
            purpose={purpose}
            onToggle={toggle}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Everything on record for one lead, fetched fresh so the list's summary is not all you see. */
function LeadDetailPanel({ leadId, fallback, selected, canSelect, verb, purpose, onToggle, onClose }: {
  leadId: string;
  fallback: Lead | null;
  selected: boolean;
  canSelect: boolean;
  verb: 'call' | 'text';
  purpose: 'campaign' | 'assignment';
  onToggle: (lead: Lead) => void;
  onClose: () => void;
}) {
  const detail = useQuery({ queryKey: ['leads', 'detail', leadId], queryFn: () => leadApi.getLead(leadId) });
  const lead = detail.data ?? fallback;
  if (!lead) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border p-6">
        {detail.isError ? <p className="text-sm text-rose-600 dark:text-rose-400">This lead could not be loaded.</p> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }
  const reachable = isReachable(lead);
  const website = toSafeWebUrl(lead.website);
  const address = getAddressLines(lead.address);
  const hours = getOpeningHoursLines(lead.providerMeta?.openingHours);
  const type = getLeadBusinessTypeLabel(lead);
  const rating = lead.providerMeta?.rating;
  const phones = [...new Set([lead.mobile, lead.phone].filter(Boolean) as string[])];

  return (
    <section aria-label={`Lead details: ${lead.name}`} className="max-h-[360px] overflow-y-auto rounded-lg border border-border bg-card p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-semibold">{lead.name}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <StatusPill status={lead.status} />
            {lead.leadNumber ? <span>#{lead.leadNumber}</span> : null}
            {type ? <span>{type}</span> : null}
            {detail.isFetching ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Loading details" /> : null}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close lead details" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>

      <dl className="space-y-2">
        <Info icon={Phone} label="Phone">{phones.length ? phones.join(' · ') : <span className="text-rose-600 dark:text-rose-400">No phone number — this lead cannot be {verb === 'call' ? 'called' : 'texted'}.</span>}</Info>
        {lead.email ? <Info icon={Mail} label="Email">{lead.email}</Info> : null}
        {website ? (
          <Info icon={Globe} label="Website">
            <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-300">{getWebsiteLabel(lead)} <ExternalLink className="h-3 w-3" /></a>
          </Info>
        ) : null}
        {address.length ? <Info icon={MapPin} label="Address">{address.map((line) => <span key={line} className="block">{line}</span>)}</Info> : null}
        {typeof rating === 'number' ? (
          <Info icon={Star} label="Rating">{rating.toFixed(1)}{lead.providerMeta?.reviewCount ? ` (${lead.providerMeta.reviewCount} reviews)` : ''}{lead.providerMeta?.businessStatus ? ` · ${lead.providerMeta.businessStatus}` : ''}</Info>
        ) : null}
        {hours.length ? <Info icon={Clock3} label="Opening hours">{hours.map((line) => <span key={line} className="block">{line}</span>)}</Info> : null}
        {lead.tags?.length ? <Info icon={Tag} label="Tags">{lead.tags.join(', ')}</Info> : null}
        <Info label="Source">{LEAD_SOURCE_LABEL[lead.source] ?? lead.source}{lead.sourceMetadata?.keyword ? ` · “${lead.sourceMetadata.keyword}”` : ''}</Info>
        {lead.notes ? <Info label="Notes"><span className="whitespace-pre-line">{lead.notes}</span></Info> : null}
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">The agent receives this lead&apos;s name, business type, address, website and notes as call context.</p>

      <button
        type="button"
        onClick={() => onToggle(lead)}
        disabled={!selected && ((purpose !== 'assignment' && !reachable) || !canSelect)}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-45 ${selected ? 'border border-border hover:bg-muted' : 'bg-brand-500 text-white hover:bg-brand-600'}`}
      >
        {selected ? <><Square className="h-4 w-4" /> Remove from {purpose === 'assignment' ? 'agent' : 'campaign'}</> : <><CheckSquare className="h-4 w-4" /> Add to {purpose === 'assignment' ? 'agent' : 'campaign'}</>}
      </button>
    </section>
  );
}

function Info({ icon: Icon, label, children }: { icon?: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {Icon ? <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <span className="w-3.5 shrink-0" />}
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}
