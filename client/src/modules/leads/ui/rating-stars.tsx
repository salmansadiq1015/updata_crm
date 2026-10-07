'use client';

import { Star } from 'lucide-react';

/**
 * A 5-star rating visual with fractional fill (e.g. 4.6 → 4.6/5 stars filled).
 * Decorative: callers supply the numeric value + review count as text for
 * screen readers. The provider (Google Places / Maps) exposes an overall rating
 * and review count but NOT a per-star histogram, so we never render fabricated
 * 5★/4★/3★ counts — only this overall visual.
 */
export function RatingStars({ rating, size = 14 }: { rating: number; size?: number }) {
  const clamped = Math.max(0, Math.min(5, rating));
  const pct = (clamped / 5) * 100;
  const stars = [0, 1, 2, 3, 4];
  const dim = { width: size, height: size };

  return (
    <span className="relative inline-flex align-middle" aria-hidden="true">
      <span className="inline-flex text-muted-foreground/30">
        {stars.map((i) => (
          <Star key={i} style={dim} className="shrink-0 fill-current stroke-0" />
        ))}
      </span>
      <span
        className="absolute inset-0 inline-flex overflow-hidden text-amber-500"
        style={{ width: `${pct}%` }}
      >
        {stars.map((i) => (
          <Star key={i} style={dim} className="shrink-0 fill-current stroke-0" />
        ))}
      </span>
    </span>
  );
}
