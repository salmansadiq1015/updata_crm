'use client';

// Staged analysis screen: a checklist of pipeline stages (never an indefinite
// spinner), live counts, an honest "N/M search regions" coverage line and a
// determinate progress bar. Cancel is wired to `useCancelDiscovery`.

import { Check, Loader2, Radar, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { DiscoverySession, DiscoverySessionStatus } from '../types/discovery-types';

type StageKey = 'planning' | 'searching' | 'fetchingDetails' | 'deduplicating' | 'matching' | 'finalizing';

const STAGES: Array<{ key: StageKey; labelKey: string; fallback: string }> = [
  { key: 'planning', labelKey: 'leadgen.analyze.stage.planning', fallback: 'Planning search regions' },
  { key: 'searching', labelKey: 'leadgen.analyze.stage.searching', fallback: 'Searching Google Places' },
  { key: 'fetchingDetails', labelKey: 'leadgen.analyze.stage.fetchingDetails', fallback: 'Fetching details' },
  { key: 'deduplicating', labelKey: 'leadgen.analyze.stage.deduplicating', fallback: 'Removing duplicates' },
  { key: 'matching', labelKey: 'leadgen.analyze.stage.matching', fallback: 'Matching against your CRM' },
  { key: 'finalizing', labelKey: 'leadgen.analyze.stage.finalizing', fallback: 'Finalizing results' },
];

const STAGE_INDEX: Record<StageKey, number> = {
  planning: 0,
  searching: 1,
  fetchingDetails: 2,
  deduplicating: 3,
  matching: 4,
  finalizing: 5,
};

/** Resolve the active stage index from the backend stage string + status. */
function currentStageIndex(stage: string | null, status: DiscoverySessionStatus): number {
  if (status === 'COMPLETED' || status === 'PARTIAL') return STAGES.length;
  const raw = (stage ?? '').toLowerCase();
  if (raw.includes('final')) return STAGE_INDEX.finalizing;
  if (raw.includes('match')) return STAGE_INDEX.matching;
  if (raw.includes('dedup')) return STAGE_INDEX.deduplicating;
  if (raw.includes('detail')) return STAGE_INDEX.fetchingDetails;
  if (raw.includes('normal')) return STAGE_INDEX.fetchingDetails;
  if (raw.includes('fetch') || raw.includes('search')) return STAGE_INDEX.searching;
  if (raw.includes('plan')) return STAGE_INDEX.planning;
  // Fall back to the coarse status machine.
  switch (status) {
    case 'DRAFT':
    case 'QUEUED':
      return STAGE_INDEX.planning;
    case 'FETCHING':
    case 'RUNNING':
      return STAGE_INDEX.searching;
    case 'NORMALIZING':
      return STAGE_INDEX.fetchingDetails;
    case 'DEDUPLICATING':
      return STAGE_INDEX.deduplicating;
    case 'MATCHING':
      return STAGE_INDEX.matching;
    default:
      return STAGE_INDEX.searching;
  }
}

function CountTile({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function DiscoveryProgress({
  session,
  onCancel,
  isCanceling,
}: {
  session: DiscoverySession;
  onCancel: () => void;
  isCanceling: boolean;
}) {
  const { t } = useLanguage();
  const { progress, counts, status, cancelRequested } = session;

  const activeIndex = currentStageIndex(progress.stage, status);
  const percent = progress.percent > 0
    ? Math.min(100, Math.round(progress.percent))
    : progress.searchesTotal > 0
      ? Math.min(100, Math.round((progress.searchesCompleted / progress.searchesTotal) * 100))
      : Math.min(95, Math.round((activeIndex / STAGES.length) * 100));

  const canceling = isCanceling || cancelRequested;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Radar className="h-6 w-6 animate-pulse text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t('leadgen.analyze.title', 'Analyzing the area')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('leadgen.analyze.subtitle', 'Searching for businesses that match your criteria.')}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <Progress value={percent} className="h-2" aria-label={t('leadgen.analyze.progress', '{percent}% complete', { percent })} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('leadgen.analyze.progress', '{percent}% complete', { percent })}</span>
          {progress.searchesTotal > 0 && (
            <span>
              {t('leadgen.analyze.searchesProgress', '{completed} of {total} searches', {
                completed: progress.searchesCompleted,
                total: progress.searchesTotal,
              })}
            </span>
          )}
        </div>
      </div>

      {/* Staged checklist */}
      <ol className="space-y-1" aria-label={t('leadgen.analyze.title', 'Analyzing the area')}>
        {STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex && status !== 'COMPLETED' && status !== 'PARTIAL';
          return (
            <li
              key={stage.key}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                active && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  done
                    ? 'border-success bg-success text-white'
                    : active
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground/40',
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                )}
              </span>
              <span className={cn(done ? 'text-muted-foreground' : active ? 'font-medium text-foreground' : 'text-muted-foreground/60')}>
                {t(stage.labelKey, stage.fallback)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Live counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountTile value={counts.discovered} label={t('leadgen.analyze.discovered', 'Found')} />
        <CountTile value={counts.new} label={t('leadgen.badge.new', 'New')} tone="text-success" />
        <CountTile value={counts.existing} label={t('leadgen.badge.existing', 'Already in CRM')} />
        <CountTile value={counts.possibleDuplicates} label={t('leadgen.badge.possibleDuplicate', 'Possible duplicate')} tone="text-warning" />
      </div>

      <div className="flex justify-center">
        <Button variant="outline" onClick={onCancel} disabled={canceling} className="gap-1.5">
          {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
          {canceling ? t('leadgen.analyze.canceling', 'Cancelling…') : t('leadgen.analyze.cancel', 'Cancel discovery')}
        </Button>
      </div>
    </div>
  );
}
