'use client';

import type { LeadRatingDistribution } from '../types/lead-types';

const LEVELS = [
  { key: 'five', star: 5 },
  { key: 'four', star: 4 },
  { key: 'three', star: 3 },
  { key: 'two', star: 2 },
  { key: 'one', star: 1 },
] as const;

/**
 * Per-star review histogram (5★…1★) with proportional bars. Rendered ONLY when
 * the provider actually supplied the breakdown — the caller passes a real
 * distribution; this component never estimates counts from the overall rating.
 */
export function RatingDistribution({
  distribution,
  locale,
}: {
  distribution: LeadRatingDistribution;
  locale?: string;
}) {
  const total = LEVELS.reduce((sum, level) => sum + (distribution[level.key] || 0), 0) || 1;
  return (
    <div className="space-y-1" role="img" aria-label="Review rating distribution">
      {LEVELS.map(({ key, star }) => {
        const count = distribution[key] || 0;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={star} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-end text-[11px] font-medium tabular-nums text-muted-foreground">
              {star}★
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-14 shrink-0 text-end text-[11px] tabular-nums text-muted-foreground">
              {count.toLocaleString(locale)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
