'use client';

import { useLanguage } from '@/lib/i18n/language-context';

const STATUS_MAP = {
  QUEUED: { labelKey: 'doctpl.emailStatus.queued', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  SENT: { labelKey: 'doctpl.emailStatus.sent', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  DELIVERED: { labelKey: 'doctpl.emailStatus.delivered', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  BOUNCED: { labelKey: 'doctpl.emailStatus.bounced', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  FAILED: { labelKey: 'doctpl.emailStatus.failed', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function EmailStatusBadge({ status }) {
  const { t } = useLanguage();
  const { labelKey, cls } = STATUS_MAP[status] ?? { labelKey: null, cls: 'bg-muted text-muted-foreground' };
  const label = labelKey ? t(labelKey) : (status ?? '-');

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
