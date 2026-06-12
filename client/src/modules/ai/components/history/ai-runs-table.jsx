'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiStatusBadge } from '../status/ai-status-badge';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';

export function AiRunsTable({ runs, isLoading, hasMore, hasPrev, onNext, onPrev }) {
  const { t } = useLanguage();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t('ai.history.empty')}</p>
        <p className="text-xs text-muted-foreground">{t('ai.history.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <button
          key={run._id}
          type="button"
          onClick={() => router.push(`/ai/${run._id}`)}
          className="w-full flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {t(`ai.workflow.${run.workflowType}`, WORKFLOW_LABELS[run.workflowType] ?? run.workflowType)}
            </p>
            {run.input && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {typeof run.input === 'string' ? run.input : JSON.stringify(run.input)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <AiStatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
            </span>
          </div>
        </button>
      ))}

      {(hasPrev || hasMore) && (
        <div className="flex gap-2 pt-2">
          {hasPrev && (
            <Button variant="outline" size="sm" onClick={onPrev} className="flex-1">
              {t('common.previous')}
            </Button>
          )}
          {hasMore && (
            <Button variant="outline" size="sm" onClick={onNext} className="flex-1">
              {t('common.next')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
