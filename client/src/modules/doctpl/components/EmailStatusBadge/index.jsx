'use client';

const STATUS_MAP = {
  QUEUED:    { label: 'Queued',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  SENT:      { label: 'Sent',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  DELIVERED: { label: 'Delivered', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  BOUNCED:   { label: 'Bounced',   cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  FAILED:    { label: 'Failed',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function EmailStatusBadge({ status }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status ?? '—', cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
