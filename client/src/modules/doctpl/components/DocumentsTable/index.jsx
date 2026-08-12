'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useDownloadDocument, usePreviewDocument } from '../../hooks/useDocumentMutations';
import { downloadFromUrl } from '@/lib/api/download';
import { formatSwissDate } from '../../utils/localization';

export function DocumentsTable({
  documents = [],
  loading = false,
  error = false,
  selectedIds = [],
  onSelectionChange,
  onPreview,
  onDownload,
}) {
  const { t, locale } = useLanguage();
  const [preview, setPreview] = useState(null);
  const download = useDownloadDocument();
  const previewDocument = usePreviewDocument();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = documents.length > 0 && documents.every((doc) => selectedSet.has(doc._id));

  const toggleAll = (checked) => {
    onSelectionChange?.(checked ? documents.map((doc) => doc._id) : []);
  };

  const toggleOne = (docId, checked) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedSet);
    if (checked) next.add(docId);
    else next.delete(docId);
    onSelectionChange([...next]);
  };

  const handlePreview = async (doc) => {
    if (onPreview) { onPreview(doc); return; }
    const r = await previewDocument.mutateAsync(doc._id);
    setPreview({ url: r?.data?.previewUrl || r?.data?.downloadUrl, fileName: r?.data?.fileName || doc.fileName });
  };

  const handleDownload = async (doc) => {
    if (onDownload) { onDownload(doc); return; }
    const r = await download.mutateAsync(doc._id);
    if (r?.data?.downloadUrl) await downloadFromUrl(r.data.downloadUrl, r.data.fileName || doc.fileName);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          {t('doctpl.documents.loadFailed', 'Documents could not be loaded.')}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!documents.length) return <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{t('doctpl.noDocuments')}</div>;

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {onSelectionChange && (
                <th className="w-10 px-4 py-2.5 text-left">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                    aria-label={t('doctpl.documents.selectAll', 'Select all documents')}
                  />
                </th>
              )}
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('doctpl.type')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('doctpl.file')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('doctpl.generated')}</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{t('doctpl.size')}</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc._id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {onSelectionChange && (
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={selectedSet.has(doc._id)}
                      onCheckedChange={(checked) => toggleOne(doc._id, Boolean(checked))}
                      aria-label={t('doctpl.documents.selectOne', 'Select {value}', { value: doc.fileName })}
                    />
                  </td>
                )}
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {t(`doctpl.type.${doc.documentType}`, doc.documentType)}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">{doc.fileName}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {formatSwissDate(doc.generatedAt, locale)}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)} KB` : '—'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 justify-end">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={t('common.preview')} onClick={() => handlePreview(doc)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={t('common.download')} onClick={() => handleDownload(doc)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DocumentPreviewDrawer
        open={!!preview}
        url={preview?.url}
        fileName={preview?.fileName}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
