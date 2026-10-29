'use client';

import { useState } from 'react';
import { ClipboardCheck, Loader2, Quote } from 'lucide-react';
import { useIntelT } from '../hooks/use-intel-t';
import { useReviewQueue } from '../hooks/use-calling-intelligence';
import { CATEGORY_ORDER, ItemReviewActions, categoryLabel, normalizedLabel } from './call-intelligence-panel';
import { CallDetailDrawer } from './call-detail-drawer';
import { panelClass, secondaryClass } from './calling-agent-primitives';

/** Extracted call facts the system was not sure about, waiting for a person. */
export function IntelligenceReviewQueue() {
  const t = useIntelT();
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const query = useReviewQueue(category || undefined, page);
  const rows = query.data?.data || [];
  const pagination = query.data?.pagination;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-sky-300" />{t('callingIntel.queue.title', 'Review queue')}</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">{t('callingIntel.queue.subtitle', 'Facts extracted from calls that need a person: low confidence, conflicting values, an agent read-back, or a value that did not validate. Accepted and corrected facts are written to the lead with the quote as evidence.')}</p></div>
      <select aria-label={t('callingIntel.queue.filter', 'Filter by category')} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="rounded-lg border border-white/12 bg-[#0c1425] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-400"><option value="">{t('callingIntel.queue.allCategories', 'All categories')}</option>{CATEGORY_ORDER.map(c => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}</select>
    </div>
    {query.isLoading && <p role="status" className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('callingIntel.common.loading', 'Loading…')}</p>}
    {query.isError && <div role="alert" className={`${panelClass} space-y-2 text-sm text-rose-300`}><p>{t('callingIntel.queue.error', 'The review queue could not be loaded.')}</p><button className={secondaryClass} onClick={() => void query.refetch()}>{t('callingIntel.common.retry', 'Try again')}</button></div>}
    {query.isSuccess && !rows.length && <div className={`${panelClass} py-10 text-center text-sm text-slate-400`}>{t('callingIntel.queue.empty', 'Nothing to review. New items appear here after calls end.')}</div>}
    <ul className="space-y-3">{rows.map(row => <li key={`${row.recordId}-${row.item.id}`} className={`${panelClass} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">{categoryLabel(t, row.item.category)}</p><p className="mt-1 text-sm font-medium text-slate-100 [overflow-wrap:anywhere]">{row.item.value}{normalizedLabel(t, row.item.normalized) && <span className="ms-2 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[11px] text-sky-300">{normalizedLabel(t, row.item.normalized)}</span>}</p><p className="mt-1 text-[11px] text-slate-500">{row.lead?.name || t('callingIntel.queue.unknownLead', 'Lead')}{row.endedAt ? ` · ${new Date(row.endedAt).toLocaleString()}` : ''} · {row.item.reviewReasons.map(r => t(`callingIntel.reason.${r}`, r.replaceAll('_', ' '))).join(', ')}</p></div>
        <button type="button" className={`${secondaryClass} px-2.5 py-1.5 text-xs`} onClick={() => setOpenCall(row.recordId)}>{t('callingIntel.queue.openCall', 'Open call')}</button>
      </div>
      <ol className="space-y-1.5 rounded-xl border border-white/8 bg-black/20 p-2.5 text-xs" aria-label={t('callingIntel.queue.context', 'Transcript context')}>{row.context.map(turn => {
        const lit = turn.turnIndex === row.item.turnIndex;
        return <li key={turn.turnIndex} className={`flex gap-2 rounded-lg p-1.5 ${lit ? 'bg-cyan-400/10 ring-1 ring-cyan-400/30' : ''}`}><span className="w-14 shrink-0 text-[10px] text-slate-500">{turn.role === 'customer' ? t('callingIntel.queue.lead', 'Lead') : t('callingIntel.queue.agent', 'Agent')}</span><span dir="auto" className="min-w-0 flex-1 text-slate-300 [overflow-wrap:anywhere]">{lit ? <><Quote className="me-1 inline h-3 w-3 text-cyan-300" aria-hidden="true" />{turn.text}</> : turn.text}</span></li>;
      })}</ol>
      <p className="text-[11px] text-slate-400">{t('callingIntel.queue.quote', 'Evidence')}: <mark dir="auto" className="rounded bg-cyan-400/20 px-1 text-cyan-100">{row.item.quote}</mark></p>
      <ItemReviewActions recordId={row.recordId} item={row.item} compact />
    </li>)}</ul>
    {pagination && pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-slate-400"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('callingIntel.common.previous', 'Previous')}</button><span>{t('callingIntel.common.page', 'Page {page} of {pages}', { page, pages: pagination.pages })}</span><button className={secondaryClass} disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>{t('callingIntel.common.next', 'Next')}</button></div>}
    {openCall && <CallDetailDrawer callId={openCall} onClose={() => setOpenCall(null)} />}
  </div>;
}
