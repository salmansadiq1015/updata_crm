'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useLanguage } from './lead-ui-kit';
import type { ExtensionImportProgress } from '../hooks/use-extension-import-progress';

/**
 * Compact live banner for an in-flight (or just-finished) Chrome-extension
 * import, driven by `useExtensionImportProgress`. Shows real counts from the
 * server — never a fabricated percentage. A finished import auto-dismisses.
 */
export function ExtensionImportBanner({
  progress,
  onDismiss,
}: {
  progress: ExtensionImportProgress;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const active = progress.status === 'running';
  const pct = progress.total
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : active
      ? 0
      : 100;

  useEffect(() => {
    if (active) return undefined;
    const id = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(id);
  }, [active, onDismiss, progress.importId]);

  const title = active
    ? t('leads.ext.import.running', 'Importing from the Chrome extension…')
    : progress.status === 'completed'
      ? t('leads.ext.import.done', 'Extension import complete')
      : progress.status === 'partial'
        ? t('leads.ext.import.partial', 'Extension import finished with some issues')
        : t('leads.ext.import.failed', 'Extension import failed');

  const barColor =
    progress.status === 'failed'
      ? 'bg-destructive'
      : progress.status === 'partial'
        ? 'bg-amber-500'
        : 'bg-primary';

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
          {active ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : progress.status === 'failed' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          )}
          <span className="truncate">{title}</span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('leads.ext.import.dismiss', 'Dismiss')}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        {t(
          'leads.ext.import.counts',
          '{processed} / {total} processed · {created} added · {existing} existing · {failed} failed',
          {
            processed: progress.processed,
            total: progress.total,
            created: progress.created,
            existing: progress.existing,
            failed: progress.failed,
          },
        )}
      </p>
    </div>
  );
}
