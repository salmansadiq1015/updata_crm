'use client';

// Truthful import result: imported / already-in-CRM / skipped / failed. No
// inflated "success" number — failed rows are shown plainly with a retry.

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import type { ImportSummary as ImportSummaryData } from '../types/discovery-types';

function SummaryTile({ value, phrase, tone }: { value: number; phrase: string; tone?: string }) {
  // `phrase` is the localized "{count} imported" string with the count already
  // interpolated; the number is pulled out visually for scannability.
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 text-center">
      <p className={cn('text-2xl font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{phrase}</p>
    </div>
  );
}

export function ImportSummary({
  summary,
  onViewLeads,
  onNewSearch,
  onRetryFailed,
  isRetrying,
}: {
  summary: ImportSummaryData;
  onViewLeads: () => void;
  onNewSearch: () => void;
  onRetryFailed?: () => void;
  isRetrying?: boolean;
}) {
  const { t } = useLanguage();
  const hasFailures = summary.failed > 0;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div
          className={cn(
            'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ring-1',
            hasFailures ? 'bg-warning/10 ring-warning/20' : 'bg-success/10 ring-success/20',
          )}
        >
          {hasFailures ? (
            <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
          )}
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          {hasFailures
            ? t('leadgen.import.summary.partial', 'Import finished with some issues')
            : t('leadgen.import.summary.title', 'Import complete')}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile
          value={summary.imported}
          phrase={t('leadgen.import.summary.imported', '{count} imported', { count: summary.imported })}
          tone="text-success"
        />
        <SummaryTile
          value={summary.existing}
          phrase={t('leadgen.import.summary.existing', '{count} already existed', { count: summary.existing })}
        />
        <SummaryTile
          value={summary.skipped}
          phrase={t('leadgen.import.summary.skipped', '{count} skipped', { count: summary.skipped })}
        />
        <SummaryTile
          value={summary.failed}
          phrase={t('leadgen.import.summary.failed', '{count} failed', { count: summary.failed })}
          tone={hasFailures ? 'text-destructive' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onViewLeads} className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.import.summary.viewLeads', 'View leads')}
        </Button>
        <Button variant="outline" onClick={onNewSearch} className="gap-1.5">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.import.summary.newSearch', 'New search')}
        </Button>
        {hasFailures && onRetryFailed && (
          <Button variant="outline" onClick={onRetryFailed} disabled={isRetrying} className="gap-1.5">
            {isRetrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t('leadgen.error.retry', 'Retry failed')}
          </Button>
        )}
      </div>
    </div>
  );
}
