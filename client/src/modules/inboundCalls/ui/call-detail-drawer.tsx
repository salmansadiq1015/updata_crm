'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bot, CalendarPlus, Check, Coins, ExternalLink, Info, Languages, Loader2, Mic, Pencil, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DetailDrawer } from '@/shared/components/detail-drawer';
import { AgentTabs } from '@/modules/aiCalling/ui/calling-agent-primitives';
import { useAssignableUsers, useInboundCall, useInboundCallActions, useInboundDevices } from '../hooks/use-inbound-calls';
import { WorkPanel } from './work-panel';
import {
  buildConversationTimeline, callerDisplay, canCreateLeadFor, leadCandidates, costPerMinute, deviceSimLabel, enumLabel, eventLabel, formatCost, formatDateTime, formatDuration, formatTime, inboundCostSourceText, type T,
} from '../inbound-domain';
import { CALLER_FIELD_KEYS, type ExtractedField, type InboundCallDetail } from '../types/inbound-call-types';
import {
  AiPill, AudioPill, CallerTypeBadge, CallStatusPill, ErrorState, FollowUpDialog, OutcomePill, Pill, QualificationPill, SkeletonBlocks,
  inputClass, primaryClass, secondaryClass,
} from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

type DetailTab = 'overview' | 'conversation' | 'qa' | 'fields' | 'notes';

export function CallDetailDrawer({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { t, intlLocale } = useInboundLanguage();
  const query = useInboundCall(callId);
  const call = query.data;
  const [tab, setTab] = useState<DetailTab>('overview');
  const [followUp, setFollowUp] = useState(false);
  const actions = useInboundCallActions(callId, t);
  const { users } = useAssignableUsers();

  return (
    <DetailDrawer
      open onOpenChange={(open) => { if (!open) onClose(); }} size="lg" enableEditMode={false}
      title={call ? callerDisplay(call, t) : t('inbound.detail.title', 'Call details')}
      subtitle={call ? `${call.caller.number || t('inbound.caller.withheld', 'Withheld number')} · ${formatDateTime(call.detectedAt, intlLocale)}` : undefined}
      footer={call ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5"><CallStatusPill status={call.status} t={t} /><OutcomePill value={call.outcome} t={t} /></div>
          <button type="button" className={`${secondaryClass} h-9 min-h-0 px-3 text-xs`} onClick={() => setFollowUp(true)}><CalendarPlus className="size-3.5" />{t('inbound.history.followUp', 'Schedule follow-up')}</button>
        </div>
      ) : undefined}
    >
      {query.isLoading ? <SkeletonBlocks count={5} className="h-24" label={t('inbound.common.loading', 'Loading…')} />
        : query.isError || !call ? <ErrorState t={t} onRetry={() => query.refetch()} />
          : (<>
            <WorkPanel key={`${call.work?.status}-${call.work?.assignee?.id}-${call.work?.updatedAt}`} work={call.work ?? null} users={users} t={t} locale={intlLocale} busy={actions.updateWork.isPending} onSave={(body) => actions.updateWork.mutate(body)} />
            <AgentTabs label={t('inbound.detail.sections', 'Call sections')} value={tab} onChange={(v) => setTab(v as DetailTab)} items={[
              { value: 'overview', label: t('inbound.detail.tab.overview', 'Overview') },
              { value: 'conversation', label: t('inbound.detail.tab.conversation', 'Transcript') },
              { value: 'qa', label: t('inbound.detail.tab.qa', 'Questions & answers') },
              { value: 'fields', label: `${t('inbound.detail.tab.fields', 'Caller details')} (${call.fields.filter((f) => !f.superseded).length})` },
              { value: 'notes', label: `${t('inbound.detail.tab.notes', 'Notes')} (${call.notes.length})` },
            ]}>
              {tab === 'overview' && <OverviewSection call={call} t={t} locale={intlLocale} actions={actions} />}
              {tab === 'conversation' && <ConversationSection call={call} t={t} locale={intlLocale} />}
              {tab === 'qa' && <QaSection call={call} t={t} />}
              {tab === 'fields' && <FieldsSection call={call} t={t} actions={actions} />}
              {tab === 'notes' && <NotesSection call={call} t={t} locale={intlLocale} actions={actions} />}
            </AgentTabs>
          </>)}
      {followUp && call ? <FollowUpDialog t={t} hasLead={Boolean(call.lead)} candidates={leadCandidates(call)} canCreate={canCreateLeadFor(call)} busy={actions.followUp.isPending} onClose={() => setFollowUp(false)} onSubmit={(v) => actions.followUp.mutate(v, { onSuccess: () => setFollowUp(false) })} /> : null}
    </DetailDrawer>
  );
}

type Actions = ReturnType<typeof useInboundCallActions>;


function Block({ title, children, icon: Icon }: { title: string; children: ReactNode; icon?: typeof Info }) {
  return <section className="space-y-2"><h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{Icon ? <Icon className="size-3.5" /> : null}{title}</h3>{children}</section>;
}
/**
 * What this call cost: the priced estimate from the API (same engine as the Costs tab).
 * Calls answered by a person or never answered consumed no AI and say so.
 */
export function CostBlock({ call, t, locale }: { call: Pick<InboundCallDetail, 'cost' | 'durationSeconds' | 'answeredBy'>; t: T; locale?: string }) {
  const c = call.cost;
  if (!c) return null;
  const tok = c.tokens;
  const perMinute = costPerMinute(c.amount, call.durationSeconds);
  const unrecorded = (c.unpriced && !c.amount) || (c.source === 'none' && call.durationSeconds > 0 && call.answeredBy === 'ai');
  const model = c.components?.model ?? 0;
  const platform = c.components?.platform ?? 0;
  const money = (v: number | null | undefined) => formatCost(v, c.currency, locale);
  return (
    <Block title={t('inbound.detail.cost', 'Cost')} icon={Coins}>
      <div className="rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/[0.06] to-cyan-500/[0.06] p-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{c.estimate ? t('inbound.costs.estimated', 'Estimated call cost') : t('inbound.costs.recorded', 'Recorded call cost')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{unrecorded ? t('inbound.costs.notRecorded', 'Not recorded') : money(c.amount)}{c.unpriced && c.amount ? <span className="ms-1 text-xs font-normal text-amber-600 dark:text-amber-300">{t('inbound.costs.partial', '(partial)')}</span> : null}</p>
          </div>
          <div className="text-end text-xs">
            <p className="text-muted-foreground">{t('inbound.detail.costPerMinute', 'Per minute')}</p>
            <p className="font-semibold tabular-nums">{perMinute == null || unrecorded ? '—' : money(perMinute)}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs">
          <dt className="text-muted-foreground">{t('inbound.detail.costModel', 'AI model')}</dt><dd className="text-end tabular-nums">{money(model)}</dd>
          <dt className="text-muted-foreground">{t('inbound.detail.costPlatform', 'Platform')}</dt><dd className="text-end tabular-nums">{money(platform)}</dd>
          <dt className="text-muted-foreground">{t('inbound.detail.costModelName', 'Model')}</dt><dd className="truncate text-end">{c.model || t('inbound.costs.notRecorded', 'Not recorded')}</dd>
        </dl>
        {tok ? (
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px]">
            <dt className="text-muted-foreground" />
            <dt className="text-end text-muted-foreground">{t('inbound.detail.tokAudio', 'Audio')}</dt><dt className="text-end text-muted-foreground">{t('inbound.detail.tokText', 'Text')}</dt>
            <dt className="text-muted-foreground">{t('inbound.detail.tokIn', 'In')}</dt><dd className="text-end tabular-nums">{tok.inputAudio.toLocaleString(locale)}</dd><dd className="text-end tabular-nums">{tok.inputText.toLocaleString(locale)}</dd>
            <dt className="text-muted-foreground">{t('inbound.detail.tokCached', 'of which cached')}</dt><dd className="text-end tabular-nums">{tok.inputCachedAudio.toLocaleString(locale)}</dd><dd className="text-end tabular-nums">{tok.inputCachedText.toLocaleString(locale)}</dd>
            <dt className="text-muted-foreground">{t('inbound.detail.tokOut', 'Out')}</dt><dd className="text-end tabular-nums">{tok.outputAudio.toLocaleString(locale)}</dd><dd className="text-end tabular-nums">{tok.outputText.toLocaleString(locale)}</dd>
            <dt className="font-medium">{t('inbound.costs.tok.total', 'Total tokens')}</dt><dd className="col-span-2 text-end font-semibold tabular-nums">{tok.total.toLocaleString(locale)}</dd>
          </dl>
        ) : null}
        {c.unpriced ? <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-px size-3.5 shrink-0" />{t('inbound.costs.src.partial', 'Cost is incomplete: some model, provider or token details could not be priced. Recorded usage is preserved; this is not a zero-cost call.')}</p> : null}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t('inbound.costs.billingTitle', 'Usage estimate · not reconciled with provider billing')} · {inboundCostSourceText({ cost: c, durationSeconds: call.durationSeconds, answeredBy: call.answeredBy }, t)} {t('inbound.detail.costSim', 'SIM airtime is not included.')}</p>
      </div>
    </Block>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">{v === null || v === undefined || v === '' ? '—' : v}</dd></div>)}</dl>;
}

const fieldValue = (call: InboundCallDetail, key: string) => call.fields.find((f) => f.key === key && !f.superseded && f.verification !== 'rejected')?.value ?? null;

function OverviewSection({ call, t, locale, actions }: { call: InboundCallDetail; t: T; locale: string; actions: Actions }) {
  const devices = useInboundDevices();
  const [executing, setExecuting] = useState<InboundCallDetail['recommendations'][number] | null>(null);
  const lang = call.language;
  const h = call.handlingDetail;
  const q = call.qualificationDetail;
  const s = call.summary;
  const canCreateLead = !call.lead && call.match.status !== 'ambiguous' && Boolean(call.caller.number) && call.caller.presentation !== 'private' && call.caller.presentation !== 'unavailable';
  return (
    <div className="space-y-6">
      <Block title={t('inbound.detail.caller', 'Caller')}>
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{fieldValue(call, 'full_name') || callerDisplay(call, t)}</span><CallerTypeBadge type={call.callerType} t={t} />{call.doNotContact ? <Pill tone="danger">{t('inbound.detail.doNotContact', 'Do not contact')}</Pill> : null}</div>
        <Facts rows={[
          [t('inbound.detail.phone', 'Phone'), call.caller.number],
          [t('inbound.field.email', 'Email'), fieldValue(call, 'email') || call.leadDetail?.email],
          [t('inbound.field.company', 'Company'), fieldValue(call, 'company')],
          [t('inbound.field.location', 'Location'), fieldValue(call, 'location') || call.leadDetail?.city],
        ]} />
        {call.lead ? (
          <p className="text-xs"><span className="text-muted-foreground">{call.lead.created ? t('inbound.detail.leadCreatedFromCall', 'Lead created from this call:') : t('inbound.detail.linkedLead', 'Linked lead:')}</span>{' '}
            <Link href={`/leads?detail=${call.lead.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{call.lead.name || call.lead.number}<ExternalLink className="size-3" /></Link>
            {call.leadDetail?.status ? <span className="ms-2 text-muted-foreground">({call.leadDetail.status})</span> : null}
          </p>
        ) : null}
        {call.match.status === 'ambiguous' && !call.lead ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('inbound.detail.ambiguous', 'This number matches more than one lead. Choose the right one — leads are never merged.')}</p>
            <ul className="mt-2 space-y-1.5">
              {call.match.candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <Link href={`/leads?detail=${c.id}`} className="truncate text-primary hover:underline">{c.name || c.number || c.id}{c.number && c.name ? ` · ${c.number}` : ''}</Link>
                  <button type="button" className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`} disabled={actions.resolveMatch.isPending} onClick={() => actions.resolveMatch.mutate(c.id)}>{actions.resolveMatch.isPending && actions.resolveMatch.variables === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{t('inbound.detail.linkThis', 'Link to this lead')}</button>
                </li>
              ))}
            </ul>
            {canCreateLeadFor(call) ? <button type="button" className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50" disabled={actions.createLead.isPending} onClick={() => actions.createLead.mutate(true)}>{t('inbound.leadChooser.createNew', 'None of these — create a new lead for this caller')}</button> : null}
          </div>
        ) : null}
        {canCreateLead ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-xs">
            <span className="flex-1 text-muted-foreground">{t('inbound.detail.noLead', 'No lead is linked to this caller yet.')}</span>
            <button type="button" className={`${primaryClass} h-9 min-h-0 px-3 text-xs`} disabled={actions.createLead.isPending} onClick={() => actions.createLead.mutate(false)}>{actions.createLead.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}{t('inbound.detail.createLead', 'Create lead')}</button>
          </div>
        ) : null}
      </Block>

      <Block title={t('inbound.detail.callInfo', 'Call')} icon={Info}>
        <div className="flex flex-wrap gap-1.5"><AiPill status={call.aiStatus} t={t} /><AudioPill status={call.audioStatus} t={t} /></div>
        {call.aiBlockedBy === 'call_waiting' ? <p role="note" className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-800 dark:text-amber-200">{t('inbound.callWaiting.detail', 'Rang while the phone was in another call, so the AI did not answer it.')}</p> : null}
        <Facts rows={[
          [t('inbound.detail.rang', 'Rang'), formatDateTime(call.detectedAt, locale)],
          [t('inbound.detail.answered', 'Answered'), call.answeredAt ? formatDateTime(call.answeredAt, locale) : t('inbound.detail.notAnswered', 'Not answered')],
          [t('inbound.detail.ended', 'Ended'), call.endedAt ? formatDateTime(call.endedAt, locale) : TERMINAL(call) ? '—' : t('inbound.detail.inProgress', 'In progress')],
          [t('inbound.col.duration', 'Duration'), `${formatDuration(call.durationSeconds)}${call.ringSeconds != null ? ` · ${t('inbound.detail.ringFor', 'rang {seconds}s', { seconds: call.ringSeconds })}` : ''}`],
          [t('inbound.col.sim', 'SIM'), deviceSimLabel(devices.data, call.device?.id, call.sim.slot, call.sim.label)],
          [t('inbound.filter.device', 'Phone'), call.device?.name],
          [t('inbound.col.agent', 'Agent'), call.agent?.name],
          [t('inbound.detail.answeringMethod', 'Answering'), [enumLabel(t, 'handledBy', call.answeredBy ?? 'none'), h?.ruleName ? `${t('inbound.detail.rule', 'rule')}: ${h.ruleName}` : null, h?.reason ? enumLabel(t, 'reason', h.reason) : null].filter(Boolean).join(' · ')],
          [t('inbound.filter.outcome', 'Outcome'), enumLabel(t, 'outcome', call.outcome)],
          [t('inbound.detail.endReason', 'End reason'), call.endReason ? t(`inbound.endReason.${call.endReason}`, call.endReason.replace(/_/g, ' ')) : null],
          [t('inbound.detail.languages', 'Languages'), lang?.initial || lang?.current ? [lang?.initial, lang?.current && lang.current !== lang.initial ? `→ ${lang.current}` : null].filter(Boolean).join(' ').toUpperCase() + (lang?.switches?.length ? ` · ${t('inbound.detail.switches', '{count} switches', { count: lang.switches.length })}` : '') : null],
          [t('inbound.detail.audio', 'Audio'), [enumLabel(t, 'audio', call.audioStatus), call.codec ? call.codec.toUpperCase() : null, call.audio?.firstAiAudioMs != null ? t('inbound.detail.firstAudio', 'first AI audio {ms} ms', { ms: call.audio.firstAiAudioMs }) : null].filter(Boolean).join(' · ')],
          [t('inbound.detail.callId', 'Call ID'), <span key="id" className="font-mono">{call.callId}</span>],
        ]} />
        {call.error ? <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/5 p-2 text-xs text-rose-700 dark:text-rose-300">{call.error.code}{call.error.message ? `: ${call.error.message}` : ''}</p> : null}
        {call.callback?.requested ? <p className="text-xs"><Pill tone="info">{t('inbound.detail.callbackRequested', 'Callback requested')}</Pill> {call.callback.whenText || ''}</p> : null}
        {call.handoff?.requested ? <p className="text-xs"><Pill tone="warning">{t('inbound.detail.humanRequested', 'Asked for a person')}</Pill> {enumLabel(t, 'handoff', call.handoff.status)}{call.handoff.reason ? ` — ${call.handoff.reason}` : ''}</p> : null}
      </Block>

      <CostBlock call={call} t={t} locale={locale} />

      <Block title={t('inbound.detail.summary', 'Summary')}>
        {s?.text || s?.reason ? (
          <div className="space-y-2 text-sm">
            {s.reason ? <p><span className="text-xs text-muted-foreground">{t('inbound.detail.reason', 'Reason for calling')}: </span>{s.reason}</p> : null}
            {s.text ? <p className="whitespace-pre-wrap leading-relaxed" dir="auto">{s.text}</p> : null}
            {([['requirements', 'Requirements'], ['concerns', 'Concerns'], ['objections', 'Objections'], ['unresolvedQuestions', 'Unresolved questions']] as const).map(([key, fallback]) => (s[key]?.length ? (
              <div key={key}><p className="text-xs font-medium text-muted-foreground">{t(`inbound.summary.${key}`, fallback)}</p><ul className="ms-4 list-disc text-xs">{s[key].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ) : null))}
            {s.generatedBy ? <p className="text-[11px] text-muted-foreground">{s.generatedBy === 'ai_agent' ? t('inbound.summary.byAgent', 'Written by the AI agent') : t('inbound.summary.bySystem', 'Assembled from what was recorded')}</p> : null}
          </div>
        ) : <p className="text-xs text-muted-foreground">{t('inbound.summary.none', 'No summary was recorded for this call.')}</p>}
      </Block>

      <Block title={t('inbound.col.qualification', 'Qualification')}>
        {q?.result ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2"><QualificationPill value={q.result} t={t} />{q.score != null ? <span className="text-muted-foreground">{t('inbound.qual.score', 'Score {score}/100', { score: q.score })}</span> : null}<span className="text-muted-foreground">· {enumLabel(t, 'inquiry', call.primaryInquiry)}</span></div>
            {q.met.length ? <p><span className="text-muted-foreground">{t('inbound.qual.met', 'Met')}: </span>{q.met.map((k) => enumLabel(t, 'field', k)).join(', ')}</p> : null}
            {q.missing.length ? <p><span className="text-muted-foreground">{t('inbound.qual.missing', 'Missing')}: </span>{q.missing.map((k) => enumLabel(t, 'field', k)).join(', ')}</p> : null}
            {q.reasons.length ? <p className="text-muted-foreground">{q.reasons.map((r) => t(`inbound.qualReason.${r}`, r.replace(/_/g, ' '))).join(' · ')}</p> : null}
          </div>
        ) : <p className="text-xs text-muted-foreground">{t('inbound.qual.none', 'Not evaluated yet — qualification runs after the call ends.')}</p>}
      </Block>

      <Block title={t('inbound.detail.recommendations', 'Recommended next steps')}>
        {call.recommendations.length ? (
          <ul className="space-y-2">
            {call.recommendations.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-xs">
                <div className="min-w-0 flex-1"><p className="font-medium">{enumLabel(t, 'recommendation', r.action)}</p>{r.reason ? <p className="mt-0.5 text-muted-foreground">{r.reason}</p> : null}</div>
                {r.status === 'pending' ? (
                  <div className="flex gap-1.5">
                    <button type="button" className={`${primaryClass} h-8 min-h-0 px-3 text-xs`} disabled={actions.decide.isPending} onClick={() => { if (call.lead && r.action !== 'REVIEW_CALLER_MATCH') actions.decide.mutate({ recId: r.id, decision: 'execute' }); else setExecuting(r); }}>{t('inbound.rec.execute', 'Execute')}</button>
                    <button type="button" className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`} disabled={actions.decide.isPending} onClick={() => actions.decide.mutate({ recId: r.id, decision: 'dismiss' })}>{t('inbound.rec.dismiss', 'Dismiss')}</button>
                  </div>
                ) : <Pill tone={r.status === 'executed' ? 'success' : 'neutral'}>{t(`inbound.rec.status.${r.status}`, r.status)}</Pill>}
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">{t('inbound.rec.none', 'No recommendations for this call.')}</p>}
        <p className="text-[11px] text-muted-foreground">{t('inbound.rec.note', 'Executing creates a follow-up task. Nothing is sent to the caller automatically.')}</p>
        {executing ? <FollowUpDialog t={t} hasLead={Boolean(call.lead) && executing.action !== 'REVIEW_CALLER_MATCH'} candidates={leadCandidates(call)} canCreate={canCreateLeadFor(call)}
          title={enumLabel(t, 'recommendation', executing.action)} fixedAction={executing.action} chooserOnly={executing.action === 'REVIEW_CALLER_MATCH'} busy={actions.decide.isPending}
          onClose={() => setExecuting(null)}
          onSubmit={(v) => actions.decide.mutate({ recId: executing.id, decision: 'execute', leadId: v.leadId, createLead: v.createLead, ...(executing.action === 'REVIEW_CALLER_MATCH' ? {} : { dueAt: v.dueAt, note: v.note || null }) }, { onSuccess: () => setExecuting(null) })} /> : null}
      </Block>
    </div>
  );
}

const TERMINAL = (c: InboundCallDetail) => ['COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED'].includes(c.status);

function ConversationSection({ call, t, locale }: { call: InboundCallDetail; t: T; locale: string }) {
  const items = useMemo(() => buildConversationTimeline(call.transcript, call.events, call.language?.switches ?? []), [call]);
  if (!call.transcript.length && !items.length) return <p className="text-xs text-muted-foreground">{t('inbound.transcript.none', 'No transcript was recorded for this call.')}</p>;
  return (
    <div className="space-y-3">
      {!call.transcript.length ? <p className="text-xs text-muted-foreground">{t('inbound.transcript.none', 'No transcript was recorded for this call.')}</p> : null}
      <ol className="space-y-2" aria-label={t('inbound.detail.tab.conversation', 'Transcript')}>
        {items.map((item, i) => {
          if (item.kind === 'turn') {
            const ai = item.turn.role === 'assistant';
            if (item.turn.role === 'system') return <li key={i} className="text-center text-[11px] italic text-muted-foreground">{item.turn.text}</li>;
            return (
              <li key={i} className={cn('flex', ai ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]', ai ? 'rounded-ss-sm border border-sky-400/20 bg-sky-400/8' : 'rounded-se-sm bg-muted')}>
                  <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{ai ? <Bot className="size-3" /> : <Mic className="size-3" />}{ai ? t('inbound.transcript.ai', 'AI') : t('inbound.transcript.caller', 'Caller')}<span className="font-normal normal-case">{formatTime(item.at, locale)}</span>{item.turn.interrupted ? <span className="font-normal normal-case text-amber-600">· {t('inbound.transcript.interrupted', 'interrupted')}</span> : null}</p>
                  <p dir="auto" className="whitespace-pre-wrap">{item.turn.text}</p>
                </div>
              </li>
            );
          }
          if (item.kind === 'language') return <li key={i} className="flex items-center justify-center gap-1.5 text-[11px] text-cyan-700 dark:text-cyan-300"><Languages className="size-3" />{t('inbound.transcript.languageSwitch', 'Language changed {from} → {to}', { from: item.from?.toUpperCase(), to: item.to?.toUpperCase() })}</li>;
          return <li key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{eventLabel(item.event, t)} · {formatTime(item.at, locale)}</span><span className="h-px flex-1 bg-border" /></li>;
        })}
      </ol>
    </div>
  );
}

function QaSection({ call, t }: { call: InboundCallDetail; t: T }) {
  const qa = call.qa;
  return (
    <div className="space-y-6">
      {qa.closingQuestions?.length ? <ClosingQuestionsList items={qa.closingQuestions} t={t} /> : null}
      <Block title={t('inbound.qa.aiAsked', 'Questions the AI asked')}>
        {qa.aiQuestions.length ? <ul className="space-y-2">{qa.aiQuestions.map((x, i) => <li key={i} className="rounded-xl border border-border p-3 text-xs"><p className="text-muted-foreground" dir="auto">{x.question}</p><p className="mt-1 font-medium" dir="auto">{x.answer}{!x.explicit ? <span className="ms-1 text-[10px] text-amber-600">({t('inbound.fields.inferred', 'inferred')})</span> : null}</p></li>)}</ul> : <p className="text-xs text-muted-foreground">{t('inbound.qa.noneAsked', 'No answers were recorded.')}</p>}
      </Block>
      <Block title={t('inbound.qa.callerAsked', 'Questions the caller asked')}>
        {qa.callerQuestions.length ? <ul className="space-y-2">{qa.callerQuestions.map((x) => (
          <li key={x.id} className="rounded-xl border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5"><Pill tone="info">{enumLabel(t, 'inquiry', x.category)}</Pill><Pill tone={x.answerStatus === 'answered' ? 'success' : x.answerStatus === 'unanswered' ? 'warning' : 'neutral'}>{enumLabel(t, 'answerStatus', x.answerStatus)}</Pill>{x.categorySource === 'rules' ? <span className="text-[10px] text-muted-foreground">{t('inbound.qa.ruleClassified', 'category from keywords')}</span> : null}</div>
            <p className="mt-1.5 font-medium" dir="auto">{x.text}</p>
            {x.answerSummary ? <p className="mt-1 text-muted-foreground" dir="auto">{x.answerSummary}</p> : null}
          </li>
        ))}</ul> : <p className="text-xs text-muted-foreground">{t('inbound.qa.noneCaller', 'The caller asked no recorded questions.')}</p>}
      </Block>
      {qa.unanswered.length ? <Block title={t('inbound.qa.unanswered', 'Not fully answered')}><ul className="ms-4 list-disc text-xs">{qa.unanswered.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul></Block> : null}
      <Block title={t('inbound.qa.missing', 'Missing information')}>
        {qa.missingInformation.length ? <div className="flex flex-wrap gap-1.5">{qa.missingInformation.map((k) => <Pill key={k} tone="warning">{enumLabel(t, 'field', k)}</Pill>)}</div> : <p className="text-xs text-muted-foreground">{t('inbound.qa.nothingMissing', 'Nothing required is missing.')}</p>}
      </Block>
    </div>
  );
}

/** Standard caller fields are translated; custom closing-question fields use their own label. */
const fieldLabel = (f: Pick<ExtractedField, 'key' | 'label'>, t: T) => ((CALLER_FIELD_KEYS as readonly string[]).includes(f.key) ? enumLabel(t, 'field', f.key) : f.label || enumLabel(t, 'field', f.key));

/** The agent's "questions before goodbye": answered (with the value), declined, or not asked. */
export function ClosingQuestionsList({ items, t }: { items: NonNullable<InboundCallDetail['qa']['closingQuestions']>; t: T }) {
  const tone = (s: string) => (s === 'answered' ? 'success' : s === 'declined' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral';
  const answered = items.filter((x) => x.status === 'answered').length;
  return (
    <Block title={t('inbound.closing.detailTitle', 'Questions before goodbye ({answered}/{total} answered)', { answered, total: items.length })}>
      <ul className="space-y-2">
        {items.map((x) => (
          <li key={x.key} className="rounded-xl border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{x.label}</span>
              {x.required ? <Pill tone="info">{t('inbound.closing.important', 'Important')}</Pill> : null}
              <Pill tone={tone(x.status)}>{enumLabel(t, 'closingStatus', x.status)}</Pill>
            </div>
            <p className="mt-1 text-muted-foreground" dir="auto">{x.question}</p>
            {x.status === 'answered' && x.value ? <p className="mt-1 text-sm font-medium [overflow-wrap:anywhere]" dir="auto">{x.value}{x.explicit === false ? <span className="ms-1 text-[10px] text-amber-600">({t('inbound.fields.inferred', 'inferred')})</span> : null}</p> : null}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function FieldsSection({ call, t, actions }: { call: InboundCallDetail; t: T; actions: Actions }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const current = call.fields.filter((f) => !f.superseded);
  const history = call.fields.filter((f) => f.superseded);
  if (!call.fields.length) return <p className="text-xs text-muted-foreground">{t('inbound.fields.none', 'The AI saved no caller details on this call.')}</p>;
  const busy = actions.reviewField.isPending;
  const row = (f: ExtractedField) => (
    <li key={f.id} className={cn('rounded-xl border border-border p-3 text-xs', f.verification === 'rejected' && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold">{fieldLabel(f, t)}</span>
        <Pill tone={f.explicit ? 'info' : 'warning'}>{f.explicit ? t('inbound.fields.explicit', 'stated by caller') : t('inbound.fields.inferred', 'inferred')}</Pill>
        <Pill tone={f.verification === 'confirmed' || f.verification === 'corrected' ? 'success' : f.verification === 'rejected' ? 'danger' : 'neutral'}>{enumLabel(t, 'verification', f.verification)}</Pill>
        {f.confidence != null ? <span className="text-[10px] text-muted-foreground">{t('inbound.fields.confidence', '{value}% confident', { value: Math.round(f.confidence * 100) })}</span> : null}
        {f.appliedToLead ? <span className="text-[10px] text-muted-foreground">{t('inbound.fields.applied', 'saved to lead')}</span> : null}
      </div>
      {editing === f.id ? (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) actions.reviewField.mutate({ fieldId: f.id, action: 'correct', value: value.trim() }, { onSuccess: () => setEditing(null) }); }}>
          <input autoFocus aria-label={t('inbound.fields.correctedValue', 'Corrected value')} className={`${inputClass} min-h-0 flex-1 py-1.5`} maxLength={1000} value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className={`${primaryClass} h-9 min-h-0 px-3 text-xs`} disabled={busy || !value.trim()}>{t('inbound.common.save', 'Save')}</button>
          <button type="button" className={`${secondaryClass} h-9 min-h-0 px-3 text-xs`} onClick={() => setEditing(null)}>{t('inbound.common.cancel', 'Cancel')}</button>
        </form>
      ) : <p className={cn('mt-1.5 text-sm [overflow-wrap:anywhere]', f.superseded && 'line-through text-muted-foreground')} dir="auto">{f.value}</p>}
      {f.evidence ? <p className="mt-1 italic text-muted-foreground" dir="auto">“{f.evidence}”</p> : null}
      {!f.superseded && editing !== f.id ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f.verification !== 'confirmed' && f.verification !== 'rejected' ? <button type="button" disabled={busy} className={`${secondaryClass} h-8 min-h-0 px-2.5 text-xs`} onClick={() => actions.reviewField.mutate({ fieldId: f.id, action: 'confirm' })}><Check className="size-3.5" />{t('inbound.fields.confirm', 'Confirm')}</button> : null}
          <button type="button" disabled={busy} className={`${secondaryClass} h-8 min-h-0 px-2.5 text-xs`} onClick={() => { setEditing(f.id); setValue(f.value); }}><Pencil className="size-3.5" />{t('inbound.fields.correct', 'Correct')}</button>
          {f.verification !== 'rejected' ? <button type="button" disabled={busy} className={`${secondaryClass} h-8 min-h-0 px-2.5 text-xs text-rose-600 dark:text-rose-400`} onClick={() => actions.reviewField.mutate({ fieldId: f.id, action: 'reject' })}><X className="size-3.5" />{t('inbound.fields.reject', 'Reject')}</button> : null}
        </div>
      ) : null}
    </li>
  );
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('inbound.fields.hint', 'Only details the caller stated count towards qualification. Confirm, correct or reject anything the AI saved.')}</p>
      <ul className="space-y-2">{current.map(row)}</ul>
      {history.length ? <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{t('inbound.fields.history', 'Earlier values ({count})', { count: history.length })}</summary><ul className="mt-2 space-y-2">{history.map(row)}</ul></details> : null}
    </div>
  );
}

function NotesSection({ call, t, locale, actions }: { call: InboundCallDetail; t: T; locale: string; actions: Actions }) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-4">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) actions.addNote.mutate(text.trim(), { onSuccess: () => setText('') }); }}>
        <label className="block text-xs font-medium text-muted-foreground">{t('inbound.notes.label', 'Note')}<textarea rows={3} maxLength={2000} className={`${inputClass} mt-1.5`} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button type="submit" className={`${primaryClass} h-9 min-h-0 px-3 text-xs`} disabled={!text.trim() || actions.addNote.isPending}>{actions.addNote.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}{t('inbound.notes.save', 'Save note')}</button>
      </form>
      {call.notes.length ? <ul className="space-y-2">{[...call.notes].reverse().map((n) => <li key={n.id} className="rounded-xl border border-border p-3 text-xs"><p className="whitespace-pre-wrap text-sm" dir="auto">{n.text}</p><p className="mt-1 text-muted-foreground">{n.byName ? `${n.byName} · ` : ''}{formatDateTime(n.at, locale)}</p></li>)}</ul> : <p className="text-xs text-muted-foreground">{t('inbound.notes.none', 'No notes yet.')}</p>}
    </div>
  );
}
