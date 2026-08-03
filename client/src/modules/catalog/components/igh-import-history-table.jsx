'use client';

import { useRef, useState } from 'react';
import { RefreshCw, Download, ChevronDown, ChevronRight, Loader2, Upload } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { useIghImportHistory, useIghImportJob, useIghConfig } from '../hooks/use-igh-queries';
import { useIghMutations } from '../hooks/use-igh-mutations';
import { IghImportPreviewDialog } from './igh-import-preview-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';

const STATUS_VARIANT = {
  PREVIEW: 'secondary',
  PENDING: 'secondary',
  RUNNING: 'default',
  COMPLETED: 'outline',
  FAILED: 'destructive',
};

function JobRow({ job }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const isActive = job.status === 'RUNNING' || job.status === 'PENDING';

  const { data: liveJob } = useIghImportJob(isActive ? job._id : null);
  const current = liveJob ?? job;

  return (
    <>
      <TableRow>
        <TableCell>
          <button
            type="button"
            className="flex items-center gap-1 text-sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {current.type === 'FULL' ? t('catalog.igh.importType.full') : t('catalog.igh.importType.delta')}
          </button>
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[current.status] ?? 'secondary'}>
            {t(`catalog.igh.status.${current.status?.toLowerCase()}`)}
          </Badge>
          {isActive && (
            <Progress value={current.progress ?? 0} className="mt-1.5 h-1.5 w-24" />
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {current.createdAt ? format(new Date(current.createdAt), 'dd.MM.yyyy HH:mm') : '—'}
        </TableCell>
        <TableCell className="text-sm">
          {current.status === 'COMPLETED' && (
            <span>
              +{current.articlesCreated ?? 0} / ~{current.articlesUpdated ?? 0}
            </span>
          )}
          {current.status === 'FAILED' && (
            <span className="text-destructive text-xs">{current.log}</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && current.log && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {current.log}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function IghImportHistoryTable() {
  const { t } = useLanguage();
  const { data: jobs = [], isLoading } = useIghImportHistory();
  const { previewImport, uploadImport, approveImport, importDelta } = useIghMutations();
  const { data: config } = useIghConfig();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const result = await uploadImport.mutateAsync(file);
      setPreview(result?.data ?? result);
      setPreviewOpen(true);
    } catch (err) {
      showError(err?.response?.data?.message || err?.message || err);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Yearly supplier catalog upload (IGH DataExpert XML) — works without
              the endpoint configuration below. */}
          <input ref={fileInputRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={handleFilePicked} />
          <Button
            size="sm"
            disabled={uploadImport.isPending || approveImport.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadImport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {uploadImport.isPending ? t('catalog.igh.uploadParsing', 'Datei wird verarbeitet…') : t('catalog.igh.uploadFile', 'Katalogdatei importieren (XML)')}
          </Button>
          {config?.isEnabled ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={previewImport.isPending || approveImport.isPending}
                onClick={async () => {
                  const result = await previewImport.mutateAsync();
                  setPreview(result?.data ?? result);
                  setPreviewOpen(true);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                {previewImport.isPending ? t('common.loading') : t('catalog.igh.importFull')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={importDelta.isPending}
                onClick={() => importDelta.mutate()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('catalog.igh.importDelta')}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t('catalog.igh.disabledNotice')}</span>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('catalog.igh.table.type')}</TableHead>
                <TableHead>{t('catalog.igh.table.status')}</TableHead>
                <TableHead>{t('catalog.igh.table.started')}</TableHead>
                <TableHead>{t('catalog.igh.table.result')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('catalog.igh.noImports')}
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => <JobRow key={job._id} job={job} />)
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <IghImportPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        preview={preview}
        onConfirm={() => {
          if (preview?._id) approveImport.mutate(preview._id);
          setPreviewOpen(false);
        }}
        isImporting={approveImport.isPending}
      />
    </>
  );
}
