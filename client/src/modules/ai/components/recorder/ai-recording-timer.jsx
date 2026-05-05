'use client';

import { cn } from '@/lib/utils';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function AiRecordingTimer({ elapsed = 0, isWarning = false }) {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <span className={cn('text-sm font-mono tabular-nums', isWarning ? 'text-destructive' : 'text-muted-foreground')}>
      {pad(minutes)}:{pad(seconds)}
    </span>
  );
}
