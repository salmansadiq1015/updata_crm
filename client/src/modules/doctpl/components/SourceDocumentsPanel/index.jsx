'use client';
import { useState } from 'react';
import { FileText, Mail, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentsTable } from '../DocumentsTable';
import { EmailComposeModal } from '../EmailComposeModal';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { useDocumentsBySource } from '../../hooks/useDocumentQueries';
import { useGenerateDocument } from '../../hooks/useDocumentMutations';
import { useDownloadDocument } from '../../hooks/useDocumentMutations';
import { useComposeEmail } from '../../hooks/useEmailMutations';

export function SourceDocumentsPanel({ sourceModule, sourceRecordId, templateType, documentData = {}, language = 'de' }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInit, setEmailInit] = useState({});
  const [preview, setPreview]     = useState(null);

  const { data: docs = [], refetch, isLoading } = useDocumentsBySource(sourceModule, sourceRecordId);
  const generate = useGenerateDocument();
  const compose  = useComposeEmail();
  const download = useDownloadDocument();

  const handleGenerate = async () => {
    await generate.mutateAsync({ templateType, sourceModule, sourceRecordId, data: documentData, language });
    refetch();
  };

  const handleEmailOpen = async () => {
    const firstDoc = docs[0];
    const r = await compose.mutateAsync({
      templateType, language,
      data: documentData,
      documentId: firstDoc?._id,
    });
    setEmailInit({
      to:              r?.data?.to?.join(', ') || '',
      subject:         r?.data?.subject || '',
      bodyHtml:        r?.data?.bodyHtml || '',
      documentId:      firstDoc?._id,
      sourceModule,
      sourceRecordId,
    });
    setEmailOpen(true);
  };

  const handlePreview = async (doc) => {
    const r = await download.mutateAsync(doc._id);
    setPreview({ url: r?.data?.downloadUrl, fileName: doc.fileName });
  };

  const handleDownload = async (doc) => {
    const r = await download.mutateAsync(doc._id);
    if (r?.data?.downloadUrl) window.open(r.data.downloadUrl, '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />Documents
        </h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generate.isPending} className="gap-1.5">
            {generate.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5" />}
            Generate PDF
          </Button>
          {docs.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleEmailOpen} className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />Send
            </Button>
          )}
        </div>
      </div>

      <DocumentsTable
        documents={docs}
        loading={isLoading}
        onPreview={handlePreview}
        onDownload={handleDownload}
      />

      <EmailComposeModal open={emailOpen} onClose={() => setEmailOpen(false)} initialValues={emailInit} />
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
    </div>
  );
}
