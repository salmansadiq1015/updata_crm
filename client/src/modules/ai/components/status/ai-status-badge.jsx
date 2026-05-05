'use client';

import { cn } from '@/lib/utils';
import { AGENT_STATUSES } from '../../constants/ai-constants';

const CONFIG = {
  [AGENT_STATUSES.PENDING]:               { label: 'Pending',       class: 'bg-muted text-muted-foreground' },
  [AGENT_STATUSES.RUNNING]:               { label: 'Running',       class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  [AGENT_STATUSES.AWAITING_CONFIRMATION]: { label: 'Action needed', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  [AGENT_STATUSES.COMPLETED]:             { label: 'Completed',     class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  [AGENT_STATUSES.FAILED]:               { label: 'Failed',        class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  [AGENT_STATUSES.CANCELLED]:            { label: 'Cancelled',     class: 'bg-muted text-muted-foreground' },
};

export function AiStatusBadge({ status, className }) {
  const config = CONFIG[status] ?? { label: status, class: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', config.class, className)}>
      {(status === AGENT_STATUSES.PENDING || status === AGENT_STATUSES.RUNNING) && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
