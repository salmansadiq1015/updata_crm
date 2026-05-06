'use client';

import { cn } from '@/lib/utils';

const fmtCache = {};
function getFormatter(currency = 'CHF') {
  if (!fmtCache[currency]) {
    fmtCache[currency] = new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return fmtCache[currency];
}

export function AmountDisplay({ amount, currency = 'CHF', className, dim = false }) {
  const formatted = getFormatter(currency).format(amount ?? 0);
  return (
    <span className={cn('tabular-nums', dim && 'text-muted-foreground', className)}>
      {formatted}
    </span>
  );
}

export function formatAmount(amount, currency = 'CHF') {
  return getFormatter(currency).format(amount ?? 0);
}
