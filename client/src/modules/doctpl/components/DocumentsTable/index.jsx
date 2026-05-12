'use client';
import { useState } from 'react';
import { FileText, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useDownloadDocument } from '../../hooks/useDocumentMutations';

const TYPE_LABELS = {
  quotation: 'Quotation', order_confirmation: 'Order Conf.', invoice_standard: 'Invoice',
  invoice_advance: 'Advance Inv.', invoice_final: 'Final Inv.', cover_letter: 'Cover Letter',
  service_report: 'Service Report', inspection_certificate: 'Inspection Cert.',
};

export function DocumentsTable({ documents = [], loading = false, onPreview, onDownload }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState(null);
  const download = useDownloadDocument();

  const handlePreview = async (doc) => {
    if (onPreview) { onPreview(doc); return; }
    const r = await download.mutateAsync(doc._id);
    setPreview({ url: r?.data?.downloadUrl, fileName: doc.fileName });
  };

  const handleDownload = async (doc) => {
    if (onDownload) { onDownload(doc); return; }
    const r = await download.mutateAsync(doc._id);
    if (r?.data?.downloadUrl) window.open(r.data.downloadUrl, '_blank');
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>;
  if (!documents.length) return <div className="py-8 text-center text-sm text-muted-foreground">{t('doctpl.noDocuments')}</div>;

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
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
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {TYPE_LABELS[doc.documentType] || doc.documentType}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">{doc.fileName}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString('de-CH') : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)} KB` : '—'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title={t('common.preview')} onClick={() => handlePreview(doc)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title={t('common.download')} onClick={() => handleDownload(doc)}>
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
