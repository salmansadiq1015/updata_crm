'use client';

import { useState, type RefObject } from 'react';
import { AlertTriangle, BookCheck, Check, CircleSlash, Loader2, PencilLine, PhoneForwarded, Quote, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useCanManageCalls, useIntelT } from '../hooks/use-intel-t';
import { CallTranscript } from './call-transcript';
import { useDecideItem, useRerunIntelligence } from '../hooks/use-calling-intelligence';
import type { CallHandoff, IntelligenceCategory, IntelligenceItem, IntelligentCallRecord } from '../types/calling-intelligence-types';

export const CATEGORY_ORDER: IntelligenceCategory[] = ['need', 'objection', 'budget', 'authority', 'urgency', 'timeline'];
export const NORMALIZED_OPTIONS: Partial<Record<IntelligenceCategory, string[]>> = {
  authority: ['decision_maker', 'influencer', 'no_authority'],
  timeline: ['immediate', 'within_3_months', 'within_6_months', 'later'],
  urgency: ['urgent', 'soon', 'not_urgent'],
};
type T = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;
const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'The request failed.');

export function categoryLabel(t: T, category: string) {
  const labels: Record<string, string> = { need: 'Needs', objection: 'Objections', budget: 'Budget', authority: 'Decision authority', urgency: 'Urgency', timeline: 'Purchase timeline' };
  return t(`callingIntel.category.${category}`, labels[category] || category);
}
export function normalizedLabel(t: T, value: unknown) {
  if (value == null || value === '') return null;
  return t(`callingIntel.value.${String(value)}`, String(value).replaceAll('_', ' '));
}
function statusLabel(t: T, status: string) {
  const labels: Record<string, string> = { accepted: 'Auto-accepted', needs_review: 'Needs review', user_accepted: 'Confirmed', user_edited: 'Corrected', user_rejected: 'Rejected' };
  return t(`callingIntel.itemStatus.${status}`, labels[status] || status);
}
function statusTone(status: string) {
  if (status === 'needs_review') return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300';
  if (status === 'user_rejected') return 'border-border bg-muted text-muted-foreground line-through';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
}

/** Accept / correct / reject one extracted item (review queue and call detail). */
export function ItemReviewActions({ recordId, item, compact = false }: { recordId: string; item: IntelligenceItem; compact?: boolean }) {
  const t = useIntelT();
  const decide = useDecideItem();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.value);
  const [normalized, setNormalized] = useState(item.normalized == null ? '' : String(item.normalized));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (decision: 'accept' | 'edit' | 'reject') => {
    setError(null); setNotice(null);
    try {
      const res = await decide.mutateAsync({ recordId, itemId: item.id, decision, ...(decision === 'edit' ? { value, normalized: normalized === '' ? null : item.category === 'budget' ? Number(normalized) : normalized } : {}) });
      if (res.leadFieldUnchanged) setNotice(t('callingIntel.review.leadUnchanged', 'Rejected. The lead field already written from this evidence was left unchanged; correct it on the lead if needed.'));
      else if (res.leadWrite?.status === 'failed') setNotice(t('callingIntel.review.leadWriteFailed', 'Saved, but the lead could not be updated: {reason}', { reason: res.leadWrite.reason || '' }));
      setEditing(false);
    } catch (e) { setError(errorText(e)); }
  };
  if (item.status !== 'needs_review' && item.status !== 'accepted') return null;
  const options = NORMALIZED_OPTIONS[item.category];
  const button = 'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50';
  return <div className="space-y-2">
    {editing ? <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input aria-label={t('callingIntel.review.correctedValue', 'Corrected value')} className="min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" value={value} onChange={e => setValue(e.target.value)} />
      {options ? <select aria-label={t('callingIntel.review.normalizedValue', 'Normalized value')} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm" value={normalized} onChange={e => setNormalized(e.target.value)}><option value="">{t('callingIntel.review.notStated', 'Not stated')}</option>{options.map(o => <option key={o} value={o}>{normalizedLabel(t, o)}</option>)}</select>
        : item.category === 'budget' ? <input type="number" min={0} aria-label={t('callingIntel.review.amount', 'Amount')} className="w-32 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" value={normalized} onChange={e => setNormalized(e.target.value)} /> : <span />}
      <div className="flex gap-1"><button type="button" disabled={decide.isPending || !value.trim()} className={`${button} border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300`} onClick={() => void run('edit')}>{decide.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}{t('callingIntel.review.saveCorrection', 'Save correction')}</button><button type="button" className={`${button} border-border`} onClick={() => setEditing(false)}>{t('callingIntel.common.cancel', 'Cancel')}</button></div>
    </div> : <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'pt-1'}`}>
      {item.status === 'needs_review' && <button type="button" disabled={decide.isPending} className={`${button} border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300`} onClick={() => void run('accept')}><Check className="size-3" />{t('callingIntel.review.accept', 'Accept')}</button>}
      <button type="button" disabled={decide.isPending} className={`${button} border-border hover:bg-muted`} onClick={() => setEditing(true)}><PencilLine className="size-3" />{t('callingIntel.review.edit', 'Correct')}</button>
      <button type="button" disabled={decide.isPending} className={`${button} border-border text-rose-600 hover:bg-rose-500/10 dark:text-rose-300`} onClick={() => void run('reject')}><X className="size-3" />{t('callingIntel.review.reject', 'Reject')}</button>
    </div>}
    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </div>;
}

function ItemCard({ recordId, item, onJump, canManage }: { recordId: string; item: IntelligenceItem; onJump: (turnIndex: number, quote: string) => void; canManage: boolean }) {
  const t = useIntelT();
  const normalized = normalizedLabel(t, item.normalized);
  return <li className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{item.value}{normalized && <span className="ms-2 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-sky-300">{normalized}</span>}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(item.status)}`}>{statusLabel(t, item.status)}</span></div>
    <button type="button" onClick={() => onJump(item.turnIndex, item.quote)} className="group flex w-full items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 text-start text-xs hover:border-cyan-500/50" aria-label={t('callingIntel.item.jump', 'Show this quote in the transcript (turn {n})', { n: item.turnIndex + 1 })}>
      <Quote className="mt-0.5 size-3 shrink-0 text-cyan-600 dark:text-cyan-300" aria-hidden="true" /><span dir="auto" className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.quote}</span><span className="shrink-0 text-[10px] text-muted-foreground group-hover:text-foreground">{t('callingIntel.item.turn', 'Turn {n}', { n: item.turnIndex + 1 })}</span>
    </button>
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      <span>{item.speaker === 'lead' ? t('callingIntel.item.saidByLead', 'Said by the lead') : t('callingIntel.item.agentReadback', 'Agent read-back the lead affirmed')}</span>
      <span>{item.confidence == null ? t('callingIntel.item.noConfidence', 'Confidence not given') : t('callingIntel.item.confidence', 'Model confidence {pct}%', { pct: Math.round(item.confidence * 100) })}</span>
      {item.reviewReasons.length > 0 && <span>{t('callingIntel.item.reasons', 'Why review')}: {item.reviewReasons.map(r => t(`callingIntel.reason.${r}`, r.replaceAll('_', ' '))).join(', ')}</span>}
      {item.leadWrite && <span>{item.leadWrite.status === 'applied' ? t('callingIntel.item.writtenToLead', 'Written to lead') : item.leadWrite.status === 'failed' ? t('callingIntel.item.leadWriteFailed', 'Lead update failed') : t('callingIntel.item.notWritten', 'Not written to lead ({reason})', { reason: t(`callingIntel.reason.${item.leadWrite.reason}`, String(item.leadWrite.reason || '').replaceAll('_', ' ')) })}</span>}
    </p>
    {canManage && <ItemReviewActions recordId={recordId} item={item} />}
  </li>;
}

export function CallIntelligencePanel({ call, onJump }: { call: IntelligentCallRecord; onJump: (turnIndex: number, quote: string) => void }) {
  const t = useIntelT();
  const canManage = useCanManageCalls();
  const rerun = useRerunIntelligence();
  const [rerunError, setRerunError] = useState<string | null>(null);
  const intel = call.intelligence;
  const ended = Boolean(call.endedAt);
  const items = intel?.items || [];
  const flags = intel?.complianceFlags || [];
  const statusText = !intel || intel.status === 'pending' ? t('callingIntel.status.pending', 'Evidence extraction runs shortly after the call ends.')
    : intel.status === 'skipped' ? t(`callingIntel.skip.${intel.reason}`, t('callingIntel.status.skipped', 'Extraction was skipped.'))
      : intel.status === 'failed' ? t('callingIntel.status.failed', 'Extraction failed: {error}', { error: intel.error || '' }) : null;
  return <section aria-label={t('callingIntel.panel.title', 'Call intelligence')} className="space-y-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-cyan-600 dark:text-cyan-300" />{t('callingIntel.panel.title', 'Call intelligence')}</h3><p className="mt-0.5 text-[11px] text-muted-foreground">{t('callingIntel.panel.subtitle', 'Only facts the lead said, each with its exact quote. Click a quote to see it in the transcript.')}</p></div>
      {canManage && ended && <button type="button" disabled={rerun.isPending} onClick={async () => { setRerunError(null); try { await rerun.mutateAsync(call._id); } catch (e) { setRerunError(errorText(e)); } }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"><RefreshCw className={`size-3 ${rerun.isPending ? 'animate-spin' : ''}`} />{t('callingIntel.panel.rerun', 'Re-run extraction')}</button>}
    </div>
    {rerunError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{rerunError}</p>}
    {call.knowledge && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><BookCheck className="size-3.5" />{call.knowledge.version ? t('callingIntel.panel.knowledgeVersion', 'Approved knowledge version {v} ({mode})', { v: call.knowledge.version, mode: t(`callingIntel.knowledgeMode.${call.knowledge.mode}`, call.knowledge.mode) }) : t('callingIntel.panel.noKnowledge', 'No approved knowledge was given to the agent on this call.')}</p>}
    {statusText && <p role="status" className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">{statusText}</p>}
    {flags.length > 0 && <div className="space-y-2 rounded-lg border border-rose-500/25 bg-rose-500/5 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300"><ShieldAlert className="size-3.5" />{t('callingIntel.compliance.title', '{n} agent statement(s) not backed by approved knowledge', { n: flags.length })}</p>
      <ul className="space-y-1.5">{flags.map((flag, i) => <li key={`${flag.turnIndex}-${i}`}><button type="button" onClick={() => onJump(flag.turnIndex, flag.quote)} className="w-full rounded-md p-1.5 text-start text-xs hover:bg-rose-500/10"><span className="font-medium">{t(`callingIntel.compliance.${flag.kind}`, flag.kind.replaceAll('_', ' '))}</span> · <span dir="auto">“{flag.quote}”</span><span className="block text-[10px] text-muted-foreground">{flag.detail}</span></button></li>)}</ul>
      <p className="text-[10px] text-muted-foreground">{t('callingIntel.compliance.note', 'Automatic check of amounts and promise wording. Review the transcript before acting.')}</p>
    </div>}
    {items.length > 0 && <div className="space-y-3">{CATEGORY_ORDER.map(category => {
      const group = items.filter(i => i.category === category);
      if (!group.length) return null;
      return <div key={category} className="space-y-1.5"><h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{categoryLabel(t, category)} · {group.length}</h4><ul className="space-y-2">{group.map(item => <ItemCard key={item.id} recordId={call._id} item={item} onJump={onJump} canManage={canManage} />)}</ul></div>;
    })}</div>}
    {intel && ['ok', 'partial'].includes(intel.status) && !items.length && <p className="text-xs text-muted-foreground">{t('callingIntel.panel.none', 'No needs, objections, budget, authority, urgency or timeline were stated: not stated.')}</p>}
    {intel?.rejected?.length ? <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><CircleSlash className="size-3" />{t('callingIntel.panel.rejected', '{n} model proposal(s) were discarded because their quote was not found verbatim in the lead’s words.', { n: intel.rejected.length })}</p> : null}
  </section>;
}

export function HandoffOutcome({ handoff }: { handoff: CallHandoff }) {
  const t = useIntelT();
  const labels: Record<string, string> = { ringing: 'Ringing team members', accepted: 'Taken over by a person', declined: 'Declined by everyone', timeout: 'Nobody answered in time', unavailable: 'Nobody available', failed: 'Transfer failed' };
  const ok = handoff.status === 'accepted';
  const followUp = handoff.fallback?.followUp;
  return <section aria-label={t('callingIntel.handoff.title', 'Human transfer')} className={`space-y-2 rounded-xl border p-3 text-xs ${ok ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
    <p className="flex items-center gap-1.5 text-sm font-semibold">{ok ? <PhoneForwarded className="size-4 text-cyan-600 dark:text-cyan-300" /> : <AlertTriangle className="size-4 text-amber-600 dark:text-amber-300" />}{t('callingIntel.handoff.title', 'Human transfer')}: {t(`callingIntel.handoff.status.${handoff.status}`, labels[handoff.status] || handoff.status)}</p>
    {handoff.reason && <p><span className="text-muted-foreground">{t('callingIntel.handoff.reason', 'Reason')}:</span> {handoff.reason}</p>}
    {handoff.summary && <p className="whitespace-pre-wrap"><span className="text-muted-foreground">{t('callingIntel.handoff.summary', 'Agent summary')}:</span> {handoff.summary}</p>}
    {handoff.mode && <p className="text-muted-foreground">{handoff.mode === 'phone' ? t('callingIntel.handoff.viaPhone', 'Transferred to the person’s phone') : t('callingIntel.handoff.viaWeb', 'Joined from the CRM')}{handoff.joinedAt ? ` · ${new Date(handoff.joinedAt).toLocaleTimeString()}` : ''}</p>}
    {handoff.failure?.message && <p className="text-rose-600 dark:text-rose-300">{handoff.failure.message}</p>}
    {handoff.fallback?.script && <p className="rounded-lg bg-background/70 p-2"><span className="text-muted-foreground">{t('callingIntel.handoff.fallbackSaid', 'Fallback offered to the caller')}:</span> <span dir="auto">“{handoff.fallback.script}”</span></p>}
    {followUp?.state && <p>{followUp.state === 'created' ? t('callingIntel.handoff.followUpCreated', 'Follow-up added to the inbox. Preferred callback time: {time}', { time: followUp.preferredTime || t('callingIntel.review.notStated', 'Not stated') }) : followUp.state === 'skipped' ? t('callingIntel.handoff.followUpSkipped', 'No follow-up for a test call.') : followUp.state === 'failed' ? t('callingIntel.handoff.followUpFailed', 'The follow-up could not be created: {reason}', { reason: followUp.reason || '' }) : t('callingIntel.handoff.followUpPending', 'Creating the follow-up…')}</p>}
    {handoff.events?.length > 0 && <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">{handoff.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {t(`callingIntel.event.${e.type}`, e.type.replaceAll('_', ' '))}</li>)}</ol>}
  </section>;
}

/** Drop-in for the call drawer: transfer outcome, extracted evidence, and the transcript it points into. */
export function TranscriptWithIntelligence({ call, live, agentName, leadName, scrollContainerRef }: { call: IntelligentCallRecord; live: boolean; agentName: string; leadName: string; scrollContainerRef?: RefObject<HTMLDivElement | null> }) {
  const [focus, setFocus] = useState<{ turnIndex: number; quote: string } | null>(null);
  const prefix = `call-turn-${call._id}`;
  const jump = (turnIndex: number, quote: string) => {
    setFocus({ turnIndex, quote });
    requestAnimationFrame(() => document.getElementById(`${prefix}-${turnIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  return <div className="space-y-4">
    {call.handoff && <HandoffOutcome handoff={call.handoff} />}
    {!live && <CallIntelligencePanel call={call} onJump={jump} />}
    <CallTranscript turns={call.transcript || []} live={live} agentName={agentName} leadName={leadName} highlight={focus} idPrefix={prefix} scrollContainerRef={scrollContainerRef} />
  </div>;
}
