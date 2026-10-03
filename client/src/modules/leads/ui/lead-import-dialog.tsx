'use client';

import { useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDownloadTemplate, useImportLeads } from '../hooks/use-leads';
import type { LeadImportMode, LeadImportResult } from '../services/lead-api';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';

const ACCEPT =
  '.csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf';

type ModeOption = {
  value: LeadImportMode;
  labelKey: string;
  label: string;
  hintKey: string;
  hint: string;
};

const MODES: readonly ModeOption[] = [
  {
    value: 'new',
    labelKey: 'leads.import.mode.new',
    label: 'Add as new',
    hintKey: 'leads.import.mode.newHint',
    hint: 'Create every row as a new lead.',
  },
  {
    value: 'skip',
    labelKey: 'leads.import.mode.skip',
    label: 'Skip existing',
    hintKey: 'leads.import.mode.skipHint',
    hint: 'Keep current leads; ignore rows that already exist.',
  },
  {
    value: 'update',
    labelKey: 'leads.import.mode.update',
    label: 'Update existing',
    hintKey: 'leads.import.mode.updateHint',
    hint: 'Overwrite matching leads with the imported values.',
  },
];

/** Human-readable file size; the number formatting is locale-agnostic. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LeadImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Bulk-import leads from a CSV / Excel / PDF file. Pick a file, choose how
 * duplicates are handled, then review the server's summary (created / skipped /
 * duplicates / failed) with an expandable list of row errors and warnings.
 */
export function LeadImportDialog({ open, onOpenChange }: LeadImportDialogProps) {
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never drop the dialog while the upload is still in flight.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        {open && <LeadImportDialogBody onClose={() => onOpenChange(false)} onPendingChange={setPending} />}
      </DialogContent>
    </Dialog>
  );
}

type LeadImportDialogBodyProps = {
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
};

function LeadImportDialogBody({ onClose, onPendingChange }: LeadImportDialogBodyProps) {
  const { t } = useLanguage();
  const uid = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const importLeads = useImportLeads();
  const downloadTemplate = useDownloadTemplate();

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<LeadImportMode>('new');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<LeadImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const busy = importLeads.isPending;

  const pickFile = (next: File | null) => {
    setFile(next);
    setResult(null);
    setShowErrors(false);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (next) pickFile(next);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const next = event.dataTransfer.files?.[0] ?? null;
    if (next) pickFile(next);
  };

  const handleImport = async () => {
    if (!file || busy) return;
    onPendingChange(true);
    try {
      const summary = await importLeads.mutateAsync({ file, mode });
      setResult(summary);
    } catch {
      // useImportLeads already raised the error toast; keep the dialog open to retry.
    } finally {
      onPendingChange(false);
    }
  };

  const resetForAnother = () => {
    pickFile(null);
    setMode('new');
  };

  // ── Result view ──────────────────────────────────────────────────────────────
  if (result) {
    return <ImportSummaryView result={result} t={t} showErrors={showErrors} onToggleErrors={() => setShowErrors((v) => !v)} onAnother={resetForAnother} onClose={onClose} />;
  }

  // ── Upload form ──────────────────────────────────────────────────────────────
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <UploadCloud className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.import.title', 'Import leads')}</DialogTitle>
            <DialogDescription>
              {t('leads.import.description', 'Upload a CSV, Excel or PDF file to add leads in bulk.')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {/* Dropzone / picker */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'rounded-xl border border-dashed p-5 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
          )}
        >
          <input
            ref={fileInputRef}
            id={`${uid}-file`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            aria-label={t('leads.import.chooseFile', 'Choose file')}
            onChange={onInputChange}
          />
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-start">
              <span className="flex min-w-0 items-center gap-2.5">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
                  <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => pickFile(null)}
                disabled={busy}
                aria-label={t('leads.import.remove', 'Remove file')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <UploadCloud className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                {t('leads.import.dropHint', 'Drag a file here, or')}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {t('leads.import.chooseFile', 'Choose file')}
              </Button>
            </div>
          )}
        </div>

        {/* PDF best-effort note */}
        <Alert>
          <FileText className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{t('leads.import.pdfNoteTitle', 'PDF is best-effort')}</AlertTitle>
          <AlertDescription>
            {t('leads.import.pdfNote', 'CSV or Excel is recommended for reliable results.')}
          </AlertDescription>
        </Alert>

        {/* Duplicate-handling mode */}
        <fieldset className="space-y-2.5">
          <legend className="text-[12px] font-medium text-muted-foreground">
            {t('leads.import.mode.label', 'When a lead already exists')}
          </legend>
          <RadioGroup
            value={mode}
            onValueChange={(value: string) => setMode(value as LeadImportMode)}
            className="gap-2"
            disabled={busy}
          >
            {MODES.map((option) => (
              <label
                key={option.value}
                htmlFor={`${uid}-mode-${option.value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  mode === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                )}
              >
                <RadioGroupItem id={`${uid}-mode-${option.value}`} value={option.value} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{t(option.labelKey, option.label)}</span>
                  <span className="block text-xs text-muted-foreground">{t(option.hintKey, option.hint)}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        {/* Template download */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4 text-sm">
          <span className="text-muted-foreground">{t('leads.import.template', 'Download template')}</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5"
            onClick={() => downloadTemplate.mutate('csv')}
            disabled={downloadTemplate.isPending}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.export.csv', 'CSV')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1.5"
            onClick={() => downloadTemplate.mutate('xlsx')}
            disabled={downloadTemplate.isPending}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            {t('leads.export.xlsx', 'Excel')}
          </Button>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleImport} disabled={!file || busy} className="gap-2">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {busy ? t('leads.import.importing', 'Importing…') : t('leads.import.submit', 'Import')}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Result summary ─────────────────────────────────────────────────────────────

type ImportSummaryViewProps = {
  result: LeadImportResult;
  t: TranslateFn;
  showErrors: boolean;
  onToggleErrors: () => void;
  onAnother: () => void;
  onClose: () => void;
};

function ImportSummaryView({ result, t, showErrors, onToggleErrors, onAnother, onClose }: ImportSummaryViewProps) {
  const { summary, errors, warnings } = result;
  const tiles: ReadonlyArray<{ key: string; label: string; value: number; tone: 'default' | 'positive' | 'negative' }> = [
    { key: 'total', label: t('leads.import.total', 'Total'), value: summary.total, tone: 'default' },
    { key: 'created', label: t('leads.import.created', 'Created'), value: summary.created, tone: 'positive' },
    { key: 'skipped', label: t('leads.import.skipped', 'Skipped'), value: summary.skipped, tone: 'default' },
    { key: 'duplicates', label: t('leads.import.duplicates', 'Duplicates'), value: summary.duplicates, tone: 'default' },
    { key: 'failed', label: t('leads.import.failed', 'Failed'), value: summary.failed, tone: 'negative' },
  ];

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{t('leads.import.summaryTitle', 'Import complete')}</DialogTitle>
            <DialogDescription>
              {t('leads.import.success', '{created} created, {failed} failed', {
                created: summary.created,
                failed: summary.failed,
              })}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-5">
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.key} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-start">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tile.label}</dt>
              <dd
                className={cn(
                  'mt-0.5 text-xl font-semibold tabular-nums',
                  tile.tone === 'positive' && tile.value > 0 && 'text-emerald-600 dark:text-emerald-400',
                  tile.tone === 'negative' && tile.value > 0 && 'text-destructive',
                  tile.tone === 'default' && 'text-foreground',
                )}
              >
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>

        {warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t('leads.import.warnings', 'Warnings')}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-0.5 ps-4">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {errors.length > 0 && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-destructive"
              onClick={onToggleErrors}
              aria-expanded={showErrors}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {showErrors
                ? t('leads.import.hideErrors', 'Hide errors')
                : t('leads.import.viewErrors', 'View errors ({count})', { count: errors.length })}
            </Button>
            {showErrors && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 text-xs">
                {errors.map((error, index) => (
                  <li key={index} className="flex gap-2 px-1.5 py-1 text-start">
                    {error.row != null && (
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {t('leads.import.rowLabel', 'Row')} {error.row}
                      </span>
                    )}
                    <span className="min-w-0 text-destructive">{error.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onAnother}>
          {t('leads.import.another', 'Import another file')}
        </Button>
        <Button onClick={onClose}>{t('leads.import.close', 'Close')}</Button>
      </DialogFooter>
    </>
  );
}
