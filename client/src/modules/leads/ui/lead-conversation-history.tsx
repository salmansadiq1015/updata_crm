'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Bell, Bot, CalendarClock, ChevronDown, ClipboardCheck, GitMerge, Loader2,
  Mail, MessageCircle, MessageSquare, Phone, PhoneCall, PhoneIncoming, ScrollText, StickyNote, Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLeadTimeline } from '../hooks/use-lead-workflow';
import type { TimelineChannel, TimelineEntry, TimelineEntryType, TimelineFilters } from '../types/lead-workflow-types';
import { useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { formatLeadDateTime } from './lead-ui-utils';
import { CallTranscriptDialog } from './call-transcript-dialog';
import { answerSourceLabel, formatQualificationValue } from './qualification-labels';

/**
 * "Conversation history" — every recorded exchange with the lead across
 * channels (mobile/SIM calls + SMS, AI calls, AI SMS, e-mail / WhatsApp /
 * SMS campaigns, contact log), answer changes, follow-ups and SLA events,
 * newest first with infinite scroll. Entries from leads merged into this one
 * are marked. Shows only what was recorded: missing data reads "not recorded".
 */

type FilterKey = 'all' | 'phone' | 'sms' | 'email' | 'whatsapp' | 'answers' | 'followUps' | 'workflow';

const FILTERS: { key: FilterKey; fallback: string; filters: TimelineFilters }[] = [
  { key: 'all', fallback: 'All', filters: {} },
  { key: 'phone', fallback: 'Calls', filters: { channel: 'phone' } },
  { key: 'sms', fallback: 'SMS', filters: { channel: 'sms' } },
  { key: 'email', fallback: 'E-mail', filters: { channel: 'email' } },
  { key: 'whatsapp', fallback: 'WhatsApp', filters: { channel: 'whatsapp' } },
  { key: 'answers', fallback: 'Answers', filters: { types: ['qualification'] } },
  { key: 'followUps', fallback: 'Follow-ups', filters: { types: ['follow_up'] } },
  { key: 'workflow', fallback: 'Assignment & SLA', filters: { types: ['workflow'] } },
];

const CHANNEL_ICON: Record<TimelineChannel, ComponentType<{ className?: string }>> = {
  phone: Phone, sms: MessageSquare, email: Mail, whatsapp: MessageCircle, other: StickyNote,
};
const TYPE_ICON: Partial<Record<TimelineEntryType, ComponentType<{ className?: string }>>> = {
  ai_call: Bot, qualification: ClipboardCheck, follow_up: CalendarClock, workflow: Workflow, sim_call_event: PhoneCall, incoming_call: PhoneIncoming,
};

const TYPE_FALLBACK: Record<TimelineEntryType, string> = {
  communication: 'Call / SMS from the app',
  contact_log: 'Contact log',
  ai_call: 'AI call',
  sms_message: 'AI SMS conversation',
  sim_call_event: 'SIM call campaign',
  incoming_call: 'Incoming call',
  provider_message: 'Campaign message',
  qualification: 'Answer changed',
  follow_up: 'Follow-up',
  workflow: 'Assignment & SLA',
};

const ROUTE_FALLBACK: Record<string, string> = {
  telecom_direct: 'SIM call (in app)',
  dialer_handoff: 'SIM call via dialer',
  sms_composer: 'SMS via composer',
  sms_direct: 'SMS sent from SIM (app)',
  sim_sms_agent: 'AI SMS agent',
  sim_call_campaign: 'SIM call campaign',
};

const WORKFLOW_FALLBACK: Record<string, string> = {
  'call.evaluated': 'Call qualification evaluated',
  'assignment.auto': 'Assigned automatically',
  'assignment.manual': 'Assigned',
  'assignment.cleared': 'Unassigned',
  'sla.started': 'Response deadline started',
  'sla.breached': 'First response overdue',
  'sla.escalated': 'Escalated to a supervisor',
  'sla.met': 'First response in time',
  'sla.late': 'First response after the deadline',
  'follow_up.overdue': 'Follow-up overdue',
  'follow_up.escalated': 'Overdue follow-up escalated',
  'task.dialed': 'Number dialed',
  'task.completed': 'Call outcome recorded',
  'task.skipped': 'Call skipped',
  'task.ineligible': 'Not eligible for calling',
  'task.callback_rescheduled': 'Callback rescheduled',
  'task.callback_cancelled': 'Callback cancelled',
  'task.callback_due': 'Callback due',
};

export function entryTitle(entry: TimelineEntry, t: TranslateFn): string {
  if (entry.type === 'communication') return t(`leads.history.route.${entry.title}`, ROUTE_FALLBACK[entry.title] ?? entry.title);
  if (entry.type === 'workflow' || entry.type === 'sim_call_event') {
    const key = String(entry.meta.eventType ?? entry.title);
    return t(`leads.history.event.${key}`, WORKFLOW_FALLBACK[key] ?? key);
  }
  if (entry.type === 'qualification') {
    return t('leads.history.answerChanged', '{field} changed', { field: t(`leads.qualification.field.${String(entry.meta.fieldKey)}`, entry.title) });
  }
  if (entry.type === 'follow_up') return t('leads.history.type.follow_up', TYPE_FALLBACK.follow_up);
  if (entry.type === 'incoming_call') {
    const by = entry.meta.answeredBy;
    return by === 'ai' ? t('leads.history.incoming.byAi', 'Incoming call answered by the AI agent')
      : by === 'human' ? t('leads.history.incoming.byHuman', 'Incoming call answered on the phone')
        : t('leads.history.incoming.unanswered', 'Incoming call (not answered)');
  }
  return entry.title || t(`leads.history.type.${entry.type}`, TYPE_FALLBACK[entry.type]);
}

function EntryIcon({ entry }: { entry: TimelineEntry }) {
  const Icon = TYPE_ICON[entry.type] ?? (entry.channel ? CHANNEL_ICON[entry.channel] : StickyNote);
  return (
    <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/10 via-blue-500/10 to-cyan-500/10 text-blue-700 dark:text-cyan-300">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {entry.direction && (
        <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-0.5 shadow-sm">
          {entry.direction === 'inbound'
            ? <ArrowDownLeft className="h-2.5 w-2.5 text-emerald-600" aria-hidden="true" />
            : <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />}
        </span>
      )}
    </div>
  );
}

function QualificationDetails({ entry, t, onOpenTranscript }: {
  entry: TimelineEntry; t: TranslateFn; onOpenTranscript: (callId: string, turn: number | null, quote: string | null) => void;
}) {
  const meta = entry.meta as {
    previous?: { value: unknown; status: string } | null; current?: { value: unknown; status: string };
    source?: string | null; evidence?: string | null; reason?: string | null; correctionOf?: string | null;
    transcriptRef?: { callRecordId: string | null; turnIndex: number | null; quote: string | null } | null;
  };
  const show = (v?: { value: unknown; status: string } | null) => (v ? formatQualificationValue(v.value, v.status, t) : '—');
  const callId = meta.transcriptRef?.callRecordId ?? entry.links.callRecordId ?? null;
  return (
    <div className="space-y-1 text-xs">
      <p className="break-words text-sm"><span className="text-muted-foreground line-through decoration-muted-foreground/50">{show(meta.previous)}</span> → <span className="font-medium">{show(meta.current)}</span></p>
      <p className="text-muted-foreground">{answerSourceLabel(meta.source ?? null, t)}</p>
      {meta.reason && <p>{t('leads.history.correctionReason', 'Reason: {reason}', { reason: meta.reason })}</p>}
      {meta.evidence && <p className="italic text-muted-foreground">“{meta.evidence}”</p>}
      {callId && (
        <button type="button" className="text-blue-700 underline underline-offset-4 dark:text-cyan-300" onClick={() => onOpenTranscript(callId, meta.transcriptRef?.turnIndex ?? null, meta.transcriptRef?.quote ?? meta.evidence ?? null)}>
          {meta.transcriptRef?.turnIndex != null
            ? t('leads.history.openTranscriptAtTurn', 'Open transcript at turn {turn}', { turn: meta.transcriptRef.turnIndex + 1 })
            : t('leads.history.openTranscript', 'Open transcript')}
        </button>
      )}
    </div>
  );
}

/** Incoming call (inboundCalling): outcome, qualification, inquiry and a link to the full call. */
function IncomingCallDetails({ entry, t }: { entry: TimelineEntry; t: TranslateFn }) {
  const meta = entry.meta as { qualification?: string | null; inquiry?: string | null; durationSeconds?: number | null; callbackRequested?: boolean; humanRequested?: boolean; device?: string | null; simSlot?: number | null };
  const callId = entry.links.inboundCallId;
  const facts = [
    meta.qualification ? t(`inbound.qualification.${meta.qualification}`, meta.qualification.replace(/_/g, ' ').toLowerCase()) : null,
    meta.inquiry ? t(`inbound.inquiry.${meta.inquiry}`, meta.inquiry.replace(/_/g, ' ').toLowerCase()) : null,
    meta.durationSeconds ? t('leads.history.duration', 'Duration {seconds}s', { seconds: Number(meta.durationSeconds) }) : null,
    meta.callbackRequested ? t('leads.history.incoming.callback', 'Callback requested') : null,
    meta.humanRequested ? t('leads.history.incoming.human', 'Asked for a person') : null,
    [meta.device, meta.simSlot != null ? `SIM ${Number(meta.simSlot) + 1}` : null].filter(Boolean).join(' · ') || null,
  ].filter(Boolean);
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {facts.length > 0 && <p>{facts.join(' · ')}</p>}
      {callId && (
        <Link href={`/incoming-calls?call=${encodeURIComponent(callId)}`} className="inline-flex items-center gap-1 text-blue-700 underline underline-offset-4 dark:text-cyan-300">
          <PhoneIncoming className="h-3 w-3" aria-hidden="true" />{t('leads.history.incoming.open', 'Open incoming call')}
        </Link>
      )}
    </div>
  );
}

function TimelineItem({ entry, locale, t, focused, onOpenTranscript }: {
  entry: TimelineEntry; locale: string; t: TranslateFn; focused: boolean;
  onOpenTranscript: (callId: string, turn: number | null, quote: string | null) => void;
}) {
  const [open, setOpen] = useState(focused);
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focused) { setOpen(true); ref.current?.scrollIntoView({ block: 'center' }); }
  }, [focused]);
  const expandable = Boolean(entry.body || entry.transcript || entry.type === 'qualification' || entry.type === 'follow_up');
  const meta = entry.meta as Record<string, unknown>;
  const detailsId = `${entry.id}-details`;
  return (
    <li ref={ref} id={`timeline-entry-${entry.id}`} className={cn('rounded-xl border bg-background/40 px-3 py-2.5', focused ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-border/60')}>
      <div className="flex items-start gap-3">
        <EntryIcon entry={entry} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">{t(`leads.history.type.${entry.type}`, TYPE_FALLBACK[entry.type])}</span>
            <time dateTime={entry.at}>{formatLeadDateTime(entry.at, locale)}</time>
            {entry.actor?.name && <span>· {entry.actor.name}</span>}
            {entry.mergedFrom && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5" title={entry.mergedFrom}>
                <GitMerge className="h-3 w-3" aria-hidden="true" />{t('leads.history.fromMerged', 'From merged lead')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium [overflow-wrap:anywhere]" dir="auto">{entryTitle(entry, t)}</p>
            {entry.status && entry.type !== 'qualification' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{t(`leads.history.status.${entry.status}`, entry.status.replace(/_/g, ' '))}</span>
            )}
          </div>
          {entry.summary && !open && <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{entry.summary}</p>}
          {entry.type === 'ai_call' && entry.transcript?.restricted && (
            <p className="text-[11px] text-muted-foreground">{t('leads.history.transcriptRestrictedShort', 'Transcript visible to the call owner only')}</p>
          )}
          {expandable && (
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-cyan-300" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden="true" />
              {open ? t('leads.history.collapse', 'Hide details') : t('leads.history.expand', 'Show details')}
            </button>
          )}
          {open && (
            <div id={detailsId} className="space-y-2">
              {entry.type === 'qualification' && <QualificationDetails entry={entry} t={t} onOpenTranscript={onOpenTranscript} />}
              {entry.summary && entry.type !== 'qualification' && <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]" dir="auto">{entry.summary}</p>}
              {entry.body && entry.body !== entry.summary && <p className="whitespace-pre-wrap rounded-lg bg-muted/40 px-2 py-1 text-sm [overflow-wrap:anywhere]" dir="auto">{entry.body}</p>}
              {entry.type === 'provider_message' && <dl className="space-y-1 text-xs text-muted-foreground">
                {(['recipientEmail', 'providerMessageId', 'sentAt', 'deliveredAt', 'failureReason'] as const).map((key) => meta[key] ? <div key={key} className="flex flex-wrap gap-1"><dt>{t(`leads.history.${key}`, ({ recipientEmail: 'Recipient', providerMessageId: 'Provider message ID', sentAt: 'Sent', deliveredAt: 'Delivered', failureReason: 'Failure reason' })[key])}:</dt><dd className="break-all">{key.endsWith('At') ? formatLeadDateTime(String(meta[key]), locale) : String(meta[key])}</dd></div> : null)}
              </dl>}
              {entry.type === 'follow_up' && (
                <p className="text-xs text-muted-foreground">
                  {t('leads.history.followUpDue', 'Due {date}', { date: formatLeadDateTime(String(meta.nextDueAt ?? meta.dueAt ?? ''), locale) })}
                  {meta.timezone ? ` (${String(meta.timezone)})` : ''}
                  {meta.requestedTimeText ? ` · ${t('leads.history.requestedTime', 'Requested: “{text}”', { text: String(meta.requestedTimeText) })}` : ''}
                </p>
              )}
              {entry.transcript && entry.transcript.excerpt.length > 0 && (
                <ol className="space-y-1 rounded-lg border border-border/60 p-2" aria-label={t('leads.history.transcriptExcerpt', 'Transcript excerpt')}>
                  {entry.transcript.excerpt.map((turn) => (
                    <li key={turn.index} className="text-xs [overflow-wrap:anywhere]" dir="auto">
                      <span className="font-medium">{turn.role === 'assistant' ? t('leads.history.agent', 'AI agent') : t('leads.history.lead', 'Lead')}:</span> {turn.text}
                    </li>
                  ))}
                </ol>
              )}
              {entry.transcript && !entry.transcript.available && (
                <p className="text-xs text-muted-foreground">{entry.transcript.expired ? t('leads.history.transcriptExpired', 'This transcript has expired under the retention policy.') : t('leads.history.transcriptEmpty', 'No transcript was recorded for this call.')}</p>
              )}
              {entry.type === 'ai_call' && entry.links.callRecordId && entry.transcript?.available && !entry.transcript.restricted && (
                <button type="button" className="inline-flex items-center gap-1 text-xs text-blue-700 underline underline-offset-4 dark:text-cyan-300" onClick={() => onOpenTranscript(entry.links.callRecordId as string, null, null)}>
                  <ScrollText className="h-3 w-3" aria-hidden="true" />
                  {t('leads.history.openFullTranscript', 'Open full transcript ({count} turns)', { count: entry.transcript.turnCount })}
                </button>
              )}
              {entry.type === 'incoming_call' && <IncomingCallDetails entry={entry} t={t} />}
              {entry.type === 'ai_call' && (
                <p className="text-xs text-muted-foreground">
                  {meta.durationSeconds != null
                    ? t('leads.history.duration', 'Duration {seconds}s', { seconds: Number(meta.durationSeconds) })
                    : t('leads.history.durationUnknown', 'Duration not recorded')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function LeadConversationHistory({ leadId, initialFilter = 'all', focusEntryId = null, hideFilters = false }: {
  leadId: string;
  initialFilter?: FilterKey;
  focusEntryId?: string | null;
  hideFilters?: boolean;
}) {
  const { t, locale } = useLanguage();
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const filters = useMemo(() => FILTERS.find((f) => f.key === filter)?.filters ?? {}, [filter]);
  const query = useLeadTimeline(leadId, filters);
  const entries = query.data?.pages.flatMap((p) => p.data) ?? [];
  const [transcript, setTranscript] = useState<{ callId: string; turn: number | null; quote: string | null } | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const focusFound = focusEntryId ? entries.some((e) => e.id === focusEntryId) : true;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Infinite scroll; also keeps paging (bounded) until a focused entry is loaded.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting) && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const pages = query.data?.pages.length ?? 0;
  useEffect(() => {
    if (!focusFound && hasNextPage && !isFetchingNextPage && pages < 20) void fetchNextPage();
  }, [focusFound, hasNextPage, isFetchingNextPage, pages, fetchNextPage]);

  return (
    <div className="space-y-3">
      {!hideFilters && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('leads.history.filterLabel', 'Filter history')}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === f.key ? 'border-transparent bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t(`leads.history.filter.${f.key}`, f.fallback)}
            </button>
          ))}
        </div>
      )}
      {query.isLoading ? (
        <div className="skeleton-shimmer h-16 rounded-xl bg-muted" aria-hidden="true" />
      ) : query.isError ? (
        <button type="button" className="text-sm text-destructive underline" onClick={() => void query.refetch()}>
          {t('leads.history.loadError', 'Conversation history could not be loaded. Retry')}
        </button>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('leads.history.empty', 'Nothing recorded yet for this lead.')}</p>
      ) : (
        <ol className="space-y-2" aria-label={t('leads.history.title', 'Conversation history')}>
          {entries.map((entry) => (
            <TimelineItem
              key={entry.id}
              entry={entry}
              locale={locale}
              t={t}
              focused={entry.id === focusEntryId}
              onOpenTranscript={(callId, turn, quote) => setTranscript({ callId, turn, quote })}
            />
          ))}
        </ol>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {query.hasNextPage && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {t('leads.history.loadMore', 'Load older entries')}
        </button>
      )}
      {focusEntryId && !focusFound && !query.hasNextPage && !query.isLoading && (
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bell className="h-3 w-3" aria-hidden="true" />{t('leads.history.focusMissing', 'The linked message is no longer in the history.')}</p>
      )}
      <CallTranscriptDialog
        leadId={leadId}
        callId={transcript?.callId ?? null}
        turnIndex={transcript?.turn ?? null}
        quote={transcript?.quote ?? null}
        onOpenChange={(open) => { if (!open) setTranscript(null); }}
      />
    </div>
  );
}
