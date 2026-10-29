'use client';

import { Ban, Flame, Snowflake, Sun, CircleDashed } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadScoreBand, LeadScoreSummary } from '../types/lead-quality-types';
import { useLanguage } from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';

export const SCORE_BAND_META: Record<LeadScoreBand, { icon: LucideIcon; className: string; fallback: string }> = {
  hot: { icon: Flame, className: 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300', fallback: 'Hot' },
  warm: { icon: Sun, className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300', fallback: 'Warm' },
  cold: { icon: Snowflake, className: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300', fallback: 'Cold' },
  unscored: { icon: CircleDashed, className: 'border-border bg-muted/60 text-muted-foreground', fallback: 'Unscored' },
};

export const getScoreBandLabel = (t: TranslateFn, band: LeadScoreBand) =>
  t(`leads.score.band.${band}`, SCORE_BAND_META[band].fallback);

/**
 * Compact score chip for the list / cards / duplicate review. A lead that was
 * never scored shows "Unscored" — never a made-up number.
 */
export function LeadScoreBadge({ score, size = 'sm', className }: { score: LeadScoreSummary | null | undefined; size?: 'sm' | 'md'; className?: string }) {
  const { t } = useLanguage();
  const band: LeadScoreBand = score ? score.band : 'unscored';
  const meta = SCORE_BAND_META[band];
  const Icon = score?.disqualified ? Ban : meta.icon;
  const label = score?.disqualified ? t('leads.score.disqualified', 'Do not contact') : getScoreBandLabel(t, band);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums',
        size === 'md' ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-0.5 text-[11px]',
        score?.disqualified ? 'border-destructive/25 bg-destructive/10 text-destructive' : meta.className,
        className,
      )}
      title={score ? `${label} · ${score.value}/100 · v${score.version}` : label}
      data-band={band}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden="true" />
      {score && band !== 'unscored' && !score.disqualified ? <span>{score.value}</span> : null}
      <span className={cn(score && band !== 'unscored' && !score.disqualified && 'font-medium opacity-80')}>{label}</span>
    </span>
  );
}
