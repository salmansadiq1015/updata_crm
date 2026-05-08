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
import apiClient from '@/lib/api/client';

export function CatalogBulkImportDialog({ open, onClose, importErrors: externalErrors }) {
  const { t } = useLanguage();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const { bulkImport } = useArticleMutations();

  const handleFile = async (file) => {
    setResult(null);
    try {
      const res = await bulkImport.mutateAsync(file);
      setResult({ success: true, data: res.data ?? res });
    } catch (err) {
      setResult({ success: false, errors: err.response?.data?.errors ?? [] });
    }
  };

  const importErrors = externalErrors ?? (result?.success === false ? result.errors : []);
  const importSummary = result?.success ? result.data : null;

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
              <a href={`${apiClient.defaults.baseURL}/catalog/articles/import/template`} download>
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
              accept=".csv,.xlsx,.xls"
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
              <p className="font-medium">Import complete</p>
              <p>Created: <Badge variant="outline">{importSummary.created ?? 0}</Badge></p>
              <p>Updated: <Badge variant="outline">{importSummary.updated ?? 0}</Badge></p>
              <p>Skipped: <Badge variant="outline">{importSummary.skipped ?? 0}</Badge></p>
              {(importSummary.errors ?? 0) > 0 && (
                <p>Errors: <Badge variant="destructive">{importSummary.errors}</Badge></p>
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
                      <th className="text-left px-3 py-2">Row</th>
                      <th className="text-left px-3 py-2">Field</th>
                      <th className="text-left px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importErrors.map((err, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground">{err.row}</td>
                        <td className="px-3 py-1.5 font-mono">{err.field}</td>
                        <td className="px-3 py-1.5 text-destructive">{err.message}</td>
                      </tr>
                    ))}
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
