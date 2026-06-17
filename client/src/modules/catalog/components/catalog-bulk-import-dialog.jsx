'use client';

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useArticleMutations } from '../hooks/use-catalog-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { articleService } from '../services/article-service';

function inferFormat(file) {
  const name = file?.name?.toLowerCase() || '';
  return name.endsWith('.json') ? 'json' : 'csv';
}

export function CatalogBulkImportDialog({ open, onClose, importErrors: externalErrors }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const { bulkImport } = useArticleMutations();

  const handleFile = async (file) => {
    setResult(null);
    try {
      const res = await bulkImport.mutateAsync({ file, format: inferFormat(file) });
      setResult({ success: true, data: res.data ?? res });
    } catch (err) {
      setResult({ success: false, errors: err.response?.data?.errors ?? [] });
    }
  };

  const importSummary = result?.success ? result.data : null;
  const importErrors = externalErrors ?? (
    result?.success === false
      ? result.errors
      : (importSummary?.rowErrors ?? [])
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setResult(null); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('catalog.articles.importTitle')}</DialogTitle>
          <DialogDescription>{t('catalog.articles.importDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href={articleService.importTemplateUrl()} download>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                {t('catalog.articles.importDownloadTemplate')}
              </a>
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={bulkImport.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {t('catalog.articles.bulkImport')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                if (bulkImport.isPending) return;
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {importSummary && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-1 text-sm">
              <p className="font-medium">{t('catalog.articles.importComplete')}</p>
              <p>{t('catalog.articles.importCreated')}: <Badge variant="outline">{importSummary.created ?? 0}</Badge></p>
              <p>{t('catalog.articles.importUpdated')}: <Badge variant="outline">{importSummary.updated ?? 0}</Badge></p>
              <p>{t('catalog.articles.importSkipped')}: <Badge variant="outline">{importSummary.skipped ?? 0}</Badge></p>
              {(importSummary.errors ?? 0) > 0 && (
                <p>{t('catalog.articles.importErrorCount')}: <Badge variant="destructive">{importSummary.errors}</Badge></p>
              )}
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {t('catalog.articles.importErrors')} ({importErrors.length})
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">{t('catalog.articles.importRow')}</th>
                      <th className="text-left px-3 py-2">{t('catalog.articles.importField')}</th>
                      <th className="text-left px-3 py-2">{t('catalog.articles.importError')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.flatMap((err, i) => {
                      const messages = err.errors || [err.message];
                      return messages.map((message, messageIndex) => (
                        <tr key={`${i}-${messageIndex}`} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{err.row}</td>
                          <td className="px-3 py-1.5 font-mono">{err.field || err.articleNumber || '-'}</td>
                          <td className="px-3 py-1.5 text-destructive">{message}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
