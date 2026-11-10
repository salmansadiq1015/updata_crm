'use client';
import { useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowMutations, useWorkflowVersions } from '../../hooks/use-workflows';
import { workflowApi } from '../../services/workflow-api';
import { formatDateTime, personName } from '../../lib/format';
import { WorkflowDiagram } from '../shared/workflow-diagram';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; workflowId: string; publishedVersion: number | null; canPublish: boolean; onRolledBack: () => void }

export function VersionsSheet({ open, onOpenChange, workflowId, publishedVersion, canPublish, onRolledBack }: Props) {
  const { t, locale } = useLanguage();
  const { data: versions = [], isLoading } = useWorkflowVersions(workflowId, open);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const { rollback } = useWorkflowMutations();
  const preview = useQuery({ queryKey: ['workflows', 'version', workflowId, selected], queryFn: () => workflowApi.version(workflowId, selected as number), enabled: open && selected !== null });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2"><History className="size-5 text-primary" />{t('workflowBuilder.versions.title', 'Version history')}</SheetTitle>
          <SheetDescription className="">{t('workflowBuilder.versions.description', 'Every publish creates an immutable version. Rolling back publishes the old graph as a new version; nothing is deleted.')}</SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <ul className="max-h-60 space-y-1 overflow-y-auto border-b p-2 md:max-h-none md:border-b-0 md:border-e">
            {isLoading && <li className="flex justify-center py-8"><Loader2 className="size-4 animate-spin" /></li>}
            {!isLoading && !versions.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t('workflowBuilder.versions.empty', 'Not published yet')}</li>}
            {versions.map((v) => (
              <li key={v._id}>
                <button type="button" onClick={() => setSelected(v.version)}
                  className={cn('w-full rounded-xl px-3 py-2.5 text-start transition-colors', selected === v.version ? 'bg-primary/10' : 'hover:bg-muted')}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{t('workflow.common.version', 'v{version}', { version: v.version })}</span>
                    {v.version === publishedVersion && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{t('workflowBuilder.versions.live', 'Live')}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(v.publishedAt, locale)} · {personName(v.publishedBy) || t('workflow.common.system', 'System')}</span>
                  {v.rolledBackFrom && <span className="block text-xs text-sky-700 dark:text-sky-300">{t('workflowBuilder.versions.rollbackOf', 'Rollback to v{version}', { version: v.rolledBackFrom })}</span>}
                  {v.notes && <span className="mt-0.5 line-clamp-2 block text-xs">{v.notes}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-h-[360px] flex-col gap-3 p-4">
            {selected === null ? <p className="m-auto text-sm text-muted-foreground">{t('workflowBuilder.versions.pick', 'Select a version to preview it')}</p> : (
              <>
                <div className="min-h-[320px] flex-1"><WorkflowDiagram graph={preview.data?.graph} className="h-full" /></div>
                {canPublish && selected !== publishedVersion && (
                  <Button variant="outline" className="self-end" onClick={() => setConfirm(selected)} disabled={rollback.isPending}>
                    <RotateCcw className="me-1.5 size-4" />{t('workflowBuilder.versions.rollback', 'Roll back to v{version}', { version: selected })}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(v: boolean) => !v && setConfirm(null)}
          title={t('workflowBuilder.versions.confirmTitle', 'Roll back to v{version}?', { version: confirm })}
          description={t('workflowBuilder.versions.confirmText', 'The draft is replaced by this version and it is published as a new version. Running executions are not affected.')}
          confirmText={t('workflowBuilder.versions.rollbackShort', 'Roll back')}
          cancelText={t('workflowBuilder.common.cancel', 'Cancel')}
          variant="default"
          loading={rollback.isPending}
          onConfirm={async () => { if (confirm !== null) { await rollback.mutateAsync({ id: workflowId, version: confirm }); setConfirm(null); onRolledBack(); } }}
        />
      </SheetContent>
    </Sheet>
  );
}
