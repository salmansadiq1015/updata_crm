'use client';

// Import flow in one modal: a server-computed preview (useImportPreview) with
// mode + assignee, then the import itself (useImport) — resolving either a sync
// summary or a 202 job that we poll (useImportJob) — and finally the truthful
// summary. Honest counts throughout: the button says exactly how many *will* be
// imported for the chosen mode.

import { useEffect, useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useImport, useImportJob, useImportPreview } from '../hooks/use-discovery';
import type { ImportMode, ImportSelection, ImportSummary as ImportSummaryData } from '../types/discovery-types';
import { ImportSummary } from './import-summary';

type ImportUser = { id: string; firstName?: string | null; lastName?: string | null; email?: string | null };

const MODE_OPTIONS: Array<{ value: ImportMode; labelKey: string; labelFallback: string; descKey: string; descFallback: string }> = [
  {
    value: 'new',
    labelKey: 'leadgen.import.mode.addNew',
    labelFallback: 'Add new only',
    descKey: 'leadgen.import.mode.addNewDesc',
    descFallback: 'Import businesses that are not yet in your CRM.',
  },
  {
    value: 'skip',
    labelKey: 'leadgen.import.mode.skipExisting',
    labelFallback: 'Skip existing',
    descKey: 'leadgen.import.mode.skipExistingDesc',
    descFallback: 'Add new ones and skip anything already matched.',
  },
  {
    value: 'update',
    labelKey: 'leadgen.import.mode.updateExisting',
    labelFallback: 'Update existing',
    descKey: 'leadgen.import.mode.updateExistingDesc',
    descFallback: 'Add new ones and refresh matched leads.',
  },
];

const NOBODY = '__nobody__';
const JOB_DONE = new Set(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED']);

export type ImportPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  selection: ImportSelection;
  users?: ImportUser[];
  onViewLeads: () => void;
  onNewSearch: () => void;
};

export function ImportPreviewDialog({
  open,
  onOpenChange,
  sessionId,
  selection,
  users = [],
  onViewLeads,
  onNewSearch,
}: ImportPreviewDialogProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<ImportMode>('new');
  const [assignedTo, setAssignedTo] = useState<string>(NOBODY);
  const [phase, setPhase] = useState<'preview' | 'importing' | 'summary'>('preview');
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummaryData | null>(null);

  // Fresh state every time the dialog is opened.
  useEffect(() => {
    if (open) {
      setMode('new');
      setAssignedTo(NOBODY);
      setPhase('preview');
      setJobId(null);
      setSummary(null);
    }
  }, [open]);

  const previewQuery = useImportPreview(sessionId, mode, selection, {
    enabled: open && phase === 'preview',
  });
  const importMutation = useImport(sessionId);
  const jobQuery = useImportJob(jobId, { poll: phase === 'importing' });

  // When a polled job finishes, turn its counts into the truthful summary.
  useEffect(() => {
    const job = jobQuery.data;
    if (phase !== 'importing' || !job || !JOB_DONE.has(job.status)) return;
    setSummary({
      imported: job.counts.created,
      existing: job.counts.existing,
      skipped: job.counts.skipped,
      failed: job.counts.failed,
      duplicates: job.counts.duplicates,
    });
    setPhase('summary');
  }, [jobQuery.data, phase]);

  const runImport = () => {
    importMutation.mutate(
      { mode, selection, ...(assignedTo !== NOBODY ? { assignedTo } : {}) },
      {
        onSuccess: (response) => {
          if (response.kind === 'async') {
            setJobId(response.jobId);
            setPhase('importing');
          } else {
            setSummary(response.summary);
            setPhase('summary');
          }
        },
      },
    );
  };

  const preview = previewQuery.data;
  const willImport = preview?.willImport ?? (selection.kind === 'SELECTED' ? selection.resultIds?.length ?? 0 : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {phase === 'summary' && summary ? (
          <>
            {/* The visible heading is ImportSummary's own; keep an accessible
                title for the dialog without duplicating it on screen. */}
            <DialogHeader className="sr-only">
              <DialogTitle>{t('leadgen.import.summary.title', 'Import complete')}</DialogTitle>
            </DialogHeader>
            <ImportSummary
              summary={summary}
              onViewLeads={onViewLeads}
              onNewSearch={() => {
                onOpenChange(false);
                onNewSearch();
              }}
              onRetryFailed={() => {
                setSummary(null);
                setJobId(null);
                setPhase('preview');
              }}
            />
          </>
        ) : phase === 'importing' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('leadgen.import.importing', 'Importing…')}</DialogTitle>
              <DialogDescription>{t('leadgen.import.subtitle', 'Adding the selected businesses to your CRM.')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              {jobQuery.data && (
                <p className="text-sm text-muted-foreground">
                  {t('leadgen.import.preview.willImport', '{count} will be imported', {
                    count: jobQuery.data.counts.processed,
                  })}
                  {' / '}
                  {jobQuery.data.counts.total}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('leadgen.import.preview.title', 'Import preview')}</DialogTitle>
              <DialogDescription>
                {t('leadgen.import.subtitle', 'Choose how discovered businesses are imported as leads.')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Mode */}
              <RadioGroup
                value={mode}
                onValueChange={(value: string) => setMode(value as ImportMode)}
                aria-label={t('leadgen.import.mode', 'Import mode')}
                className="gap-2"
              >
                {MODE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      mode === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t(option.labelKey, option.labelFallback)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t(option.descKey, option.descFallback)}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>

              {/* Assign to */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t('leadgen.import.assign', 'Assign to')}</p>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('leadgen.import.assignPlaceholder', 'Nobody')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOBODY}>{t('leadgen.import.assignNobody', 'Nobody')}</SelectItem>
                    {users.map((user) => {
                      const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || user.id;
                      return (
                        <SelectItem key={user.id} value={user.id} textValue={name}>
                          <span className="flex items-center gap-2">
                            <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            {name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview counts */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                {previewQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  </div>
                ) : preview ? (
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dd className="text-base font-semibold text-success">{preview.new}</dd>
                      <dt className="text-xs text-muted-foreground">{t('leadgen.badge.new', 'New')}</dt>
                    </div>
                    <div>
                      <dd className="text-base font-semibold text-foreground">{preview.existing}</dd>
                      <dt className="text-xs text-muted-foreground">{t('leadgen.badge.existing', 'Already in CRM')}</dt>
                    </div>
                    <div>
                      <dd className="text-base font-semibold text-warning">{preview.possibleDuplicates}</dd>
                      <dt className="text-xs text-muted-foreground">
                        {t('leadgen.badge.possibleDuplicate', 'Possible duplicate')}
                      </dt>
                    </div>
                  </dl>
                ) : (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    {t('leadgen.error.generic.body', 'Preview unavailable.')}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  {t('leadgen.wizard.cancel', 'Cancel')}
                </Button>
                <Button onClick={runImport} disabled={importMutation.isPending || willImport === 0}>
                  {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {willImport != null
                    ? t('leadgen.import.confirmCount', 'Import {count} leads', { count: willImport })
                    : t('leadgen.import.confirm', 'Import leads')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
