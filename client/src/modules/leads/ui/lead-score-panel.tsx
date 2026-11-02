'use client';

import { AlertTriangle, Ban, Info, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useLeadScore, useRecalculateLeadScore } from '../hooks/use-lead-quality';
import type { LeadScoreEvidence, LeadScoreExplanation, LeadScoreFactor } from '../types/lead-quality-types';
import { Button, useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { LeadScoreBadge, getScoreBandLabel } from './lead-score-badge';

const GROUPS = ['business', 'qualification', 'engagement'] as const;
const REF_FALLBACK: Record<string, string> = {
  lead: 'Lead', lead_communication: 'Mobile call / SMS', call_record: 'AI call', sim_sms_message: 'SMS reply',
  call_suppression: 'Do-not-call entry', message_suppression: 'Message suppression', opt_out_event: 'Opt-out',
};
const GROUP_FALLBACK: Record<string, string> = {
  business: 'Business information', qualification: 'Qualification answers', engagement: 'Engagement',
};
const SOURCE_LABELS: Record<string, string> = {
  provider: 'Business listing', google_places: 'Google Maps', lead: 'Lead record',
  'lead.lastContactedAt': 'Lead record', user: 'Team member', user_correction: 'Team correction',
  ai_proposed_user_confirmed: 'AI suggestion confirmed by team', sms_agent: 'SMS assistant',
  ai_call_agent: 'AI calling assistant', ai_call: 'AI call', call_record: 'AI call',
  mobile_call: 'Phone call', calls: 'Call history', communication: 'Communication history',
  lead_communication: 'Phone call / SMS', sim_sms: 'SMS conversation',
  call_suppression: 'Do-not-call list', message_suppression: 'Message opt-out list', opt_out: 'Opt-out request',
  manual: 'Manual entry', import: 'Imported data', extension: 'Browser extension', website: 'Website', referral: 'Referral',
};

function sourceLabel(t: TranslateFn, source: string) {
  const key = source.split(':')[0];
  return SOURCE_LABELS[key]
    ? t(`leads.score.source.${key}`, SOURCE_LABELS[key])
    : t('leads.score.source.other', 'Other source');
}

export const factorLabel = (t: TranslateFn, factor: { key: string; label?: string }) =>
  t(`leads.score.factor.${factor.key}`, factor.key === 'provider_rating' ? 'Business rating' : factor.label || factor.key.replace(/[_.]/g, ' '));

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatValue(t: TranslateFn, value: unknown): string {
  if (value === true) return t('leads.score.evidence.yes', 'present');
  if (value == null) return '—';
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.amount === 'number') return `${v.amount}${v.currency ? ` ${v.currency}` : ''}`;
    return JSON.stringify(value);
  }
  return String(value).replace(/_/g, ' ');
}

function EvidenceLine({ evidence }: { evidence: LeadScoreEvidence }) {
  const { t, locale } = useLanguage();
  const date = formatDate(evidence.at, locale);
  const ref = evidence.ref;
  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
      <p>
        <span className="font-medium text-foreground/80">{formatValue(t, evidence.value)}</span>
        {evidence.source && <span>{` · ${t('leads.score.evidence.source', 'Source')}: ${sourceLabel(t, evidence.source)}`}</span>}
        {date && <span>{` · ${date}`}</span>}
      </p>
      {evidence.quote && <p className="italic">“{evidence.quote}”</p>}
      {ref?.id && ref.type !== 'lead' && (
        <p>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-px text-[10px] font-medium text-primary" title={ref.id}>
            {t(`leads.score.ref.${ref.type}`, REF_FALLBACK[ref.type] ?? 'Record')} · {ref.id.slice(-6)}
          </span>
        </p>
      )}
    </div>
  );
}

function FactorRow({ factor }: { factor: LeadScoreFactor }) {
  const { t } = useLanguage();
  const isPenalty = factor.minPoints != null;
  const pct = factor.maxPoints > 0 ? Math.max(0, Math.min(100, (factor.points / factor.maxPoints) * 100)) : 0;
  return (
    <li className="px-3 py-2.5" data-factor={factor.key}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">{factorLabel(t, factor)}</span>
        <span className={cn('shrink-0 text-[12px] font-semibold tabular-nums', isPenalty && factor.points < 0 ? 'text-destructive' : 'text-foreground')}>
          {isPenalty
            ? t('leads.score.penalty', '{points} pts (penalty)', { points: factor.points })
            : t('leads.score.points', '{points} / {max} pts', { points: factor.points, max: factor.maxPoints })}
        </span>
      </div>
      {!isPenalty && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {factor.evidence && <EvidenceLine evidence={factor.evidence} />}
    </li>
  );
}

export function LeadScoreExplanationView({ data }: { data: LeadScoreExplanation }) {
  const { t } = useLanguage();
  const dnc = data.factors.find((f) => f.key === 'do_not_contact');
  return (
    <div className="space-y-3">
      {dnc && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5 text-[12px] text-destructive">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div>
            <p>{t('leads.score.disqualifiedNote', 'A do-not-contact is on record, so this lead is disqualified regardless of other signals.')}</p>
            {dnc.evidence && <EvidenceLine evidence={dnc.evidence} />}
          </div>
        </div>
      )}
      {data.band === 'unscored' && !data.disqualified && (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leads.score.unscoredNote', 'Too little is recorded to rank this lead honestly.')}
        </p>
      )}
      {GROUPS.map((group) => {
        const factors = data.factors.filter((f) => f.group === group && f.key !== 'do_not_contact');
        if (!factors.length) return null;
        return (
          <div key={group}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`leads.score.group.${group}`, GROUP_FALLBACK[group])}
            </p>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
              {factors.map((f) => <FactorRow key={f.key} factor={f} />)}
            </ul>
          </div>
        );
      })}
      {data.missing.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('leads.score.missingTitle', 'Not recorded (0 points, never estimated)')}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {data.missing.map((m) => (
              <li key={m.key} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground" data-missing={m.key}>
                {factorLabel(t, m)} · {t(`leads.score.reason.${m.reason}`, m.reason.replace(/_/g, ' '))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Drawer section: the evidence-backed breakdown of a lead's score. */
export function LeadScorePanel({ leadId, canRecalculate }: { leadId: string; canRecalculate: boolean }) {
  const { t, locale } = useLanguage();
  const query = useLeadScore(leadId);
  const recalc = useRecalculateLeadScore(leadId);

  if (query.isLoading) {
    return <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <p role="alert" className="flex items-center gap-1.5 py-2 text-[12px] text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {t('leads.score.loadError', 'The score could not be loaded.')}
      </p>
    );
  }
  const data = query.data;
  const computed = formatDate(data.stored?.computedAt ?? data.computedAt, locale);
  const onRecalc = () => recalc.mutate(undefined, {
    onSuccess: () => showSuccess(t('leads.score.recalculated', 'Score recalculated')),
    onError: () => showError(t('leads.score.loadError', 'The score could not be loaded.')),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-gradient-to-r from-blue-600/[0.06] via-blue-500/[0.04] to-cyan-500/[0.06] p-3">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[28px] font-bold leading-none tabular-nums text-foreground" aria-label={`${t('leads.score.label', 'Score')} ${data.score}`}>{data.score}</p>
            <p className="text-[10px] text-muted-foreground">{t('leads.score.outOf', 'of 100')}</p>
          </div>
          <div className="space-y-1">
            <LeadScoreBadge score={{ value: data.score, band: data.band, version: data.version, computedAt: data.computedAt, disqualified: data.disqualified, factors: [] }} size="md" />
            <p className="text-[11px] text-muted-foreground">
              {t('leads.score.version', 'Config v{version}', { version: data.version })}
              {computed ? ` · ${t('leads.score.computedAt', 'Computed {date}', { date: computed })}` : ''}
            </p>
          </div>
        </div>
        {canRecalculate && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onRecalc} disabled={recalc.isPending}>
            <RefreshCw className={cn('h-3.5 w-3.5', recalc.isPending && 'animate-spin')} aria-hidden="true" />
            {t('leads.score.recalculate', 'Recalculate')}
          </Button>
        )}
      </div>
      {data.stale && data.stored && (
        <p className="text-[11px] text-muted-foreground">
          {t('leads.score.stale', 'The list shows an older value — recalculate to update it.')}
          {` (${getScoreBandLabel(t, data.stored.band)} ${data.stored.value})`}
        </p>
      )}
      <LeadScoreExplanationView data={data} />
    </div>
  );
}
