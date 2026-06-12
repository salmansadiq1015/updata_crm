'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { AGENT_STATUSES } from '../../constants/ai-constants';

const CONFIG = {
  [AGENT_STATUSES.PENDING]:               { labelKey: 'ai.status.pending',      class: 'bg-muted text-muted-foreground' },
  [AGENT_STATUSES.RUNNING]:               { labelKey: 'ai.status.running',      class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  [AGENT_STATUSES.AWAITING_CONFIRMATION]: { labelKey: 'ai.status.actionNeeded', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  [AGENT_STATUSES.COMPLETED]:             { labelKey: 'ai.status.completed',    class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  [AGENT_STATUSES.FAILED]:                { labelKey: 'ai.status.failed',       class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  [AGENT_STATUSES.CANCELLED]:             { labelKey: 'ai.status.cancelled',    class: 'bg-muted text-muted-foreground' },
};

export function AiStatusBadge({ status, className }) {
  const { t } = useLanguage();
  const config = CONFIG[status] ?? { labelKey: null, class: 'bg-muted text-muted-foreground' };
  const label = config.labelKey ? t(config.labelKey, status) : status;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', config.class, className)}>
      {(status === AGENT_STATUSES.PENDING || status === AGENT_STATUSES.RUNNING) && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
