'use client';

import { useRef, useState } from 'react';
import { AlertCircle, FileSpreadsheet, ShieldCheck, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function FieldOpsOrderImportDialog({ open, onOpenChange, importOrders, downloadImportTemplate }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState(null);

  const close = (nextOpen) => {
    if (!nextOpen) {
      setFile(null);
      setResult(null);
      setDryRun(true);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    if (!file || importOrders.isPending) return;
    importOrders.mutate(
      { file, dryRun },
      { onSuccess: (data) => setResult(data) },
    );
  };

  const rowErrors = result?.rowErrors || [];
  const canRunImport = file && !importOrders.isPending;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="bg-linear-to-r from-primary/10 via-cyan-500/10 to-emerald-500/10">
          <DialogTitle>{t('fieldOps.orders.import.title', 'Import Orders')}</DialogTitle>
          <DialogDescription>
            {t('fieldOps.orders.import.description', 'Validate a CSV file before creating orders and fix row-level issues precisely.')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t('fieldOps.orders.import.referenceTitle', 'Reference CSV')}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t(
                  'fieldOps.orders.import.referenceDescription',
                  'Required fields: orderType, title, scheduledStart, and scheduledEnd. Use ObjectIds for employeeId, projectId, customerId, and siteId when linking existing records.',
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => downloadImportTemplate.mutate()}
                disabled={downloadImportTemplate.isPending}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {downloadImportTemplate.isPending
                  ? t('fieldOps.orders.import.downloadingTemplate', 'Downloading...')
                  : t('fieldOps.orders.import.downloadTemplate', 'Download Reference CSV')}
              </Button>
            </div>

            <div className="rounded-lg border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                {t('fieldOps.orders.import.guardrailsTitle', 'Import Guardrails')}
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
                <Checkbox id="order-import-dry-run" checked={dryRun} onCheckedChange={(value) => setDryRun(Boolean(value))} />
                <Label htmlFor="order-import-dry-run" className="text-xs">
                  {t('fieldOps.orders.import.dryRunLabel', 'Dry run: validate only, create nothing')}
                </Label>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t(
                  'fieldOps.orders.import.guardrailsDescription',
                  'Imports respect technician conflict checks. Use overrideConflicts and overrideReason only for approved scheduling exceptions.',
                )}
              </p>
            </div>
          </div>

          <div
            className={cn(
              'rounded-lg border border-dashed p-4 transition-colors',
              file ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/10',
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {file?.name || t('fieldOps.orders.import.selectFile', 'Choose CSV file')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {file
                    ? `${Math.round(file.size / 1024)} KB`
                    : t('fieldOps.orders.import.fileHint', 'Maximum 500 rows per import.')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {file && (
                  <Button variant="ghost" size="icon-sm" onClick={() => { setFile(null); setResult(null); }}>
                    <X className="h-4 w-4" />
                    <span className="sr-only">{t('fieldOps.orders.import.removeFile', 'Remove file')}</span>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  {t('fieldOps.orders.import.chooseFile', 'Select File')}
                </Button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setFile(nextFile);
                setResult(null);
                event.target.value = '';
              }}
            />
          </div>

          {result && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={rowErrors.length ? 'destructive' : 'success'}>
                  {rowErrors.length
                    ? t('fieldOps.orders.import.resultNeedsFixes', 'Needs Fixes')
                    : t('fieldOps.orders.import.resultReady', 'Ready')}
                </Badge>
                <Badge variant="outline">{t('fieldOps.orders.import.rows', 'Rows')} {result.totalRows ?? 0}</Badge>
                <Badge variant="outline">{t('fieldOps.orders.import.valid', 'Valid')} {result.validRows ?? 0}</Badge>
                <Badge variant="outline">{t('fieldOps.orders.import.created', 'Created')} {result.created ?? 0}</Badge>
              </div>

              {rowErrors.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {t('fieldOps.orders.import.rowErrors', 'Row Errors')} ({rowErrors.length})
                  </div>
                  <div className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-background">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">{t('fieldOps.orders.import.row', 'Row')}</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">{t('fieldOps.orders.import.field', 'Field')}</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">{t('fieldOps.orders.import.error', 'Error')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowErrors.map((error, index) => (
                          <tr key={`${error.row}-${error.field}-${index}`} className="border-t border-border/50">
                            <td className="px-3 py-2 text-muted-foreground">{error.row}</td>
                            <td className="px-3 py-2 font-mono">{error.field || '-'}</td>
                            <td className="px-3 py-2 text-destructive">{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={importOrders.isPending}>
            {t('fieldOps.orders.import.close', 'Close')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canRunImport}>
            {importOrders.isPending
              ? t('fieldOps.orders.import.processing', 'Processing...')
              : dryRun
                ? t('fieldOps.orders.import.validateImport', 'Validate Import')
                : t('fieldOps.orders.import.createOrders', 'Create Orders')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
