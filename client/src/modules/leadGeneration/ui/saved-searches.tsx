'use client';

// Discovery history: each past session with its criteria, counts, status and
// date, plus view (reopen results), re-run (new session, same criteria), cancel
// (while active) and delete.

import { useState } from 'react';
import { Clock, Loader2, MapPin, Play, RotateCw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import {
  isActiveSession,
  useCancelDiscovery,
  useDeleteDiscovery,
  useDiscoverySessions,
  useFlattenedSessions,
} from '../hooks/use-discovery';
import type { DiscoverySession, DiscoverySessionStatus } from '../types/discovery-types';

const STATUS_TONE: Record<DiscoverySessionStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  QUEUED: 'bg-primary/10 text-primary',
  RUNNING: 'bg-primary/10 text-primary',
  FETCHING: 'bg-primary/10 text-primary',
  NORMALIZING: 'bg-primary/10 text-primary',
  DEDUPLICATING: 'bg-primary/10 text-primary',
  MATCHING: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success',
  PARTIAL: 'bg-warning/10 text-warning',
  FAILED: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
};

export function SavedSearches({
  onView,
  onRerun,
}: {
  onView: (session: DiscoverySession) => void;
  onRerun: (session: DiscoverySession) => void;
}) {
  const { t, locale } = useLanguage();
  const sessionsQuery = useDiscoverySessions({ limit: 20 });
  const sessions = useFlattenedSessions(sessionsQuery.data);
  const cancelMutation = useCancelDiscovery();
  const deleteMutation = useDeleteDiscovery();
  const [deleteTarget, setDeleteTarget] = useState<DiscoverySession | null>(null);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const formatArea = (session: DiscoverySession) => {
    const sqKm = session.area.areaSqKm;
    if (sqKm == null) return session.area.type ?? '';
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(sqKm)} km²`;
  };

  if (sessionsQuery.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton-shimmer h-20 rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Clock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('leadgen.saved.empty', 'No saved searches yet')}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {sessions.map((session) => {
          const active = isActiveSession(session.status);
          const typeNames = session.businessTypes.map((bt) => bt.name ?? bt.id).filter(Boolean);
          const typeLabel = typeNames.length ? typeNames.join(', ') : t('leadgen.businessType.title', 'Businesses');
          return (
            <li key={session.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{typeLabel}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {session.location.name ?? session.location.formattedAddress ?? '—'} · {formatArea(session)}
                    </span>
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONE[session.status])}>
                  {session.status}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('leadgen.saved.resultsCount', '{count} results', { count: session.counts.discovered })}
                  {session.counts.new > 0 && ` · ${t('leadgen.analyze.newCount', '{count} new', { count: session.counts.new })}`}
                  {' · '}
                  {formatDate(session.createdAt)}
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button size="xs" variant="outline" className="gap-1" onClick={() => onView(session)}>
                  <Play className="h-3 w-3" aria-hidden="true" />
                  {t('leadgen.saved.view', 'View')}
                </Button>
                <Button size="xs" variant="outline" className="gap-1" onClick={() => onRerun(session)}>
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  {t('leadgen.saved.rerun', 'Re-run')}
                </Button>
                {active && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="gap-1 text-muted-foreground"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(session.id)}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    {t('leadgen.saved.cancel', 'Cancel')}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  className="ms-auto gap-1 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(session)}
                >
                  {deleteMutation.isPending && deleteMutation.variables === session.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  )}
                  {t('leadgen.saved.delete', 'Delete')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t('leadgen.saved.delete', 'Delete this search?')}
        description={t('leadgen.error.generic.body', 'This removes the saved search and its results.')}
        confirmText={t('leadgen.saved.delete', 'Delete')}
        cancelText={t('leadgen.wizard.cancel', 'Cancel')}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
