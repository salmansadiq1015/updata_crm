'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

/**
 * Duplicate candidate banner shown inside the CustomerForm when a similar
 * customer (same name, optionally same PLZ) already exists.
 * Clicking a candidate closes the form (via onDismiss) and navigates.
 */
export function DuplicateWarning({
  title,
  description,
  duplicates = [],
  onDismiss,
  className,
}) {
  const { t } = useLanguage();
  if (!duplicates?.length) return null;

  const resolvedTitle = title ?? t('crm.duplicatesFound', 'Possible duplicates found');
  const resolvedDesc = description ?? t('crm.duplicatesDesc', 'Customers with similar names already exist:');

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/30 bg-amber-500/5 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {resolvedTitle}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
            {resolvedDesc}
          </p>

          <ul className="mt-3 space-y-1">
            {duplicates.slice(0, 5).map((d) => (
              <li key={d._id}>
                <Link
                  href={`/crm/customers/${d._id}`}
                  onClick={onDismiss}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-amber-500/10"
                >
                  <span className="font-medium truncate">{d.name}</span>
                  {d.customerNumber && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {d.customerNumber}
                    </span>
                  )}
                  {(d.postalCode || d.city) && (
                    <span className="text-xs text-muted-foreground truncate">
                      — {[d.postalCode, d.city].filter(Boolean).join(' ')}
                    </span>
                  )}
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
