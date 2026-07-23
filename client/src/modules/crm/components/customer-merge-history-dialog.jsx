'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { useCustomerMutations } from '@/modules/crm/hooks/use-customer-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { GitMerge, RotateCcw, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmtDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const userName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '');

/**
 * Lists recent merges so a key user can reverse one that was done by mistake.
 * Already-reversed merges are shown greyed out rather than hidden, so the
 * history stays readable.
 */
export function CustomerMergeHistoryDialog({ open, onOpenChange }) {
  const { t } = useLanguage();
  const [undoTarget, setUndoTarget] = useState(null);

  const { data: merges = [], isLoading } = useQuery({
    queryKey: ['crm', 'customers', 'merges'],
    queryFn: () => customerService.listMerges({ limit: 30, includeUndone: true }),
    enabled: open,
  });

  const { undoMerge } = useCustomerMutations({
    onMerge: () => setUndoTarget(null),
  });

  const totalMoved = (counts = {}) =>
    Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[85vh] rounded-2xl border border-border bg-card"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20 shrink-0">
                <GitMerge className="h-5 w-5 text-brand-600 dark:text-brand-300" />
              </div>
              <div>
                <DialogTitle className="text-[16px] font-semibold text-foreground">
                  {t('crm.mergeHistory', 'Zusammenführungen')}
                </DialogTitle>
                <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                  {t('crm.mergeHistoryDesc', 'Eine versehentliche Zusammenführung kann hier rückgängig gemacht werden.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}

            {!isLoading && merges.length === 0 && (
              <EmptyState
                title={t('crm.noMerges', 'Keine Zusammenführungen')}
                description={t('crm.noMergesDesc', 'Es wurden noch keine Kunden zusammengeführt.')}
              />
            )}

            {merges.map((m) => {
              const undone = !!m.undoneAt;
              return (
                <div
                  key={m._id}
                  className={cn(
                    'rounded-lg border p-4',
                    undone ? 'border-border bg-muted/30 opacity-70' : 'border-border bg-muted/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground flex-wrap">
                        <span className="truncate">{m.sourceName || '—'}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{m.targetName || '—'}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {fmtDate(m.createdAt)}
                        {userName(m.mergedBy) && ` · ${userName(m.mergedBy)}`}
                        {` · ${totalMoved(m.counts)} ${t('crm.movedRecords', 'verschobene Datensätze')}`}
                      </p>
                      {undone && (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {t('crm.mergeUndoneOn', 'Rückgängig gemacht am {date}', { date: fmtDate(m.undoneAt) })}
                          {userName(m.undoneBy) && ` · ${userName(m.undoneBy)}`}
                        </p>
                      )}
                    </div>

                    {!undone && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => setUndoTarget(m)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t('common.undo', 'Rückgängig')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!undoTarget}
        onOpenChange={(v) => !v && setUndoTarget(null)}
        title={t('crm.confirmUndoMerge', 'Zusammenführung rückgängig machen?')}
        description={t(
          'crm.confirmUndoMergeDesc',
          'Kontakte, Objekte, Notizen und Belege gehen an "{source}" zurück, und der Kunde wird wieder aktiviert.',
          { source: undoTarget?.sourceName || '' },
        )}
        onConfirm={() => undoMerge.mutate(undoTarget._id)}
        loading={undoMerge.isPending}
        confirmText={t('common.undo', 'Rückgängig')}
      />
    </>
  );
}
