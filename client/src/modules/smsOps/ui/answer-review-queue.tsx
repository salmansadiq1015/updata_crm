'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { useAnswerReviews, useSmsOpsMutations } from '../hooks/use-sms-ops';
import { displayValue, formatDateTime, relativeTime } from '../sms-ops-domain';
import type { AnswerReview, ReviewDecision, ReviewProposal } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

type Choice = { action: 'accept' | 'edit' | 'reject'; value: string };

const REASON_FALLBACK: Record<string, string> = {
  no_question_keyword: 'The reply part does not name the question',
  numbering_ambiguous: 'The numbering could refer to another question',
  ambiguous_question: 'The same words could answer several questions',
  conflicting_values: 'Different values for the same question',
  several_options_mentioned: 'Several options mentioned',
  model_proposal: 'Suggested by the AI (quoted from the reply)',
};

/** Value typed in "edit" → the API value (booleans/numbers/lists keep their type). */
export function editedValue(proposal: ReviewProposal, raw: string): unknown {
  const text = raw.trim();
  if (proposal.type === 'boolean') return /^(true|yes|ja|oui|نعم|1)$/i.test(text);
  if (['integer', 'decimal', 'currency', 'rating'].includes(proposal.type || '') && text !== '' && Number.isFinite(Number(text))) return Number(text);
  if (proposal.type === 'multiple_choice') return text.split(',').map((s) => s.trim()).filter(Boolean);
  return text;
}

/** The resolve payload for a set of per-proposal choices. */
export function buildDecisions(review: AnswerReview, choices: Record<string, Choice>): ReviewDecision[] {
  return review.proposals.map((p) => {
    const c = choices[p.fieldKey] ?? { action: 'accept', value: '' };
    if (c.action === 'edit') return { fieldKey: p.fieldKey, action: 'edit', value: editedValue(p, c.value) };
    return { fieldKey: p.fieldKey, action: c.action };
  });
}

function ProposalRow({ proposal, choice, onChange }: { proposal: ReviewProposal; choice: Choice; onChange: (c: Choice) => void }) {
  const { t } = useSmsOpsLanguage();
  const pct = proposal.confidence != null ? Math.round(proposal.confidence * 100) : null;
  return (
    <li className="space-y-2 rounded-lg border border-border p-3" data-testid={`proposal-${proposal.fieldKey}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" dir="auto">{proposal.label || proposal.fieldKey}</span>
        <span className="text-muted-foreground">→</span>
        <span className="rounded bg-brand-500/10 px-2 py-0.5 text-sm font-semibold text-brand-600 dark:text-brand-400" dir="auto">{displayValue(proposal.proposedValue)}</span>
        {pct != null ? <span className="ms-auto text-xs tabular-nums text-muted-foreground">{t('smsOps.reviews.confidence', 'Confidence {n}%', { n: pct })}</span> : null}
      </div>
      {proposal.evidence ? (
        <blockquote className="border-s-2 border-brand-500/50 ps-2 text-sm text-muted-foreground" dir="auto">“{proposal.evidence}”</blockquote>
      ) : null}
      {proposal.reason ? <p className="text-xs text-muted-foreground">{t(`smsOps.reviews.reason.${proposal.reason}`, REASON_FALLBACK[proposal.reason] ?? proposal.reason)}</p> : null}
      {proposal.alternatives?.length ? (
        <p className="text-xs text-muted-foreground">{t('smsOps.reviews.alternatives', 'Alternatives')}: <span dir="auto">{proposal.alternatives.map(displayValue).join(' · ')}</span></p>
      ) : null}
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">{t('smsOps.reviews.decision', 'Decision')}</legend>
        {(['accept', 'edit', 'reject'] as const).map((a) => (
          <label key={a} className="inline-flex items-center gap-1.5">
            <input type="radio" name={`decision-${proposal.fieldKey}`} checked={choice.action === a} onChange={() => onChange({ ...choice, action: a })} />
            {t(`smsOps.reviews.${a}`, a === 'accept' ? 'Accept' : a === 'edit' ? 'Edit' : 'Reject')}
          </label>
        ))}
        {choice.action === 'edit' ? (
          <input
            aria-label={t('smsOps.reviews.correctValue', 'Correct value')}
            dir="auto"
            className="min-w-40 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            value={choice.value}
            onChange={(e) => onChange({ ...choice, value: e.target.value })}
          />
        ) : null}
      </fieldset>
    </li>
  );
}

export function ReviewCard({ review }: { review: AnswerReview }) {
  const { t, locale } = useSmsOpsLanguage();
  const m = useSmsOpsMutations();
  const [choices, setChoices] = useState<Record<string, Choice>>(
    () => Object.fromEntries(review.proposals.map((p) => [p.fieldKey, { action: 'accept', value: displayValue(p.proposedValue) === '—' ? '' : displayValue(p.proposedValue) }])),
  );
  const [note, setNote] = useState('');
  const pending = review.status === 'pending';
  const submit = () => m.resolveReview.mutate(
    { id: review._id, decisions: buildDecisions(review, choices), note: note.trim() || null },
    { onSuccess: () => showSuccess(t('smsOps.reviews.saved', 'Review saved')) },
  );
  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label={review.lead?.name || review._id}>
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold" dir="auto">{review.lead?.name || t('smsOps.reviews.unknownLead', 'Lead')}</span>
        {review.campaign?.name ? <span className="text-muted-foreground" dir="auto">· {review.campaign.name}</span> : null}
        {review.language ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase">{t(`smsOps.language.${review.language}`, review.language)}</span> : null}
        <time className="ms-auto text-xs text-muted-foreground" dateTime={review.createdAt} title={formatDateTime(review.createdAt, locale)}>{relativeTime(review.createdAt, locale)}</time>
      </header>
      <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-sm" dir="auto" data-testid="review-reply">{review.reply}</p>
      {pending ? (
        <>
          <ul className="space-y-2">
            {review.proposals.map((p) => (
              <ProposalRow key={p.fieldKey} proposal={p} choice={choices[p.fieldKey]} onChange={(c) => setChoices((s) => ({ ...s, [p.fieldKey]: c }))} />
            ))}
          </ul>
          <textarea dir="auto" rows={2} aria-label={t('smsOps.recovery.note', 'Note (optional)')} placeholder={t('smsOps.recovery.note', 'Note (optional)')} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end">
            <button type="button" onClick={submit} disabled={m.resolveReview.isPending} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {t('smsOps.reviews.submit', 'Save decisions')}
            </button>
          </div>
        </>
      ) : (
        <ul className="space-y-1 text-sm">
          {review.proposals.map((p) => (
            <li key={p.fieldKey}>
              <span dir="auto">{p.label || p.fieldKey}</span>: <span dir="auto">{displayValue(p.decision === 'reject' ? null : (p.finalValue ?? p.proposedValue))}</span>
              {p.decision ? <span className="text-muted-foreground"> ({t(`smsOps.reviews.${p.decision}`, p.decision)})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function AnswerReviewQueue() {
  const { t } = useSmsOpsLanguage();
  const [status, setStatus] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAnswerReviews({ status, page });
  const reviews = data?.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('smsOps.recovery.status', 'Status')} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          {(['pending', 'resolved', 'dismissed'] as const).map((s) => <option key={s} value={s}>{t(`smsOps.reviews.status.${s}`, s)}</option>)}
        </select>
        <p className="text-sm text-muted-foreground">{t('smsOps.reviews.hint', 'Answers the SMS agent found but did not assume. Accepted values are written to the lead’s qualification.')}</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p> : null}
      {isError ? <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>{t('smsOps.loadError', 'Could not load. Retry')}</button> : null}
      {!isLoading && !isError && !reviews.length ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t('smsOps.reviews.empty', 'No answers waiting for review')}</p>
        </div>
      ) : null}
      <div className="space-y-3">{reviews.map((r) => <ReviewCard key={r._id} review={r} />)}</div>
      {data && data.pagination.pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 disabled:opacity-40">{t('smsOps.previous', 'Previous')}</button>
          <span className="tabular-nums">{page} / {data.pagination.pages}</span>
          <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 disabled:opacity-40">{t('smsOps.next', 'Next')}</button>
        </div>
      ) : null}
    </div>
  );
}
