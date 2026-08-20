'use client';
import { useMemo, useState } from 'react';
import { FileText, Mail, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentsTable } from '../DocumentsTable';
import { EmailComposeModal } from '../EmailComposeModal';
import { DocumentPreviewDrawer } from '../DocumentPreviewDrawer';
import { EmailStatusBadge } from '../EmailStatusBadge';
import { useDocumentsBySource } from '../../hooks/useDocumentQueries';
import { useGenerateDocument } from '../../hooks/useDocumentMutations';
import { useDownloadDocument, usePreviewDocument } from '../../hooks/useDocumentMutations';
import { downloadFromUrl } from '@/lib/api/download';
import { useComposeEmail } from '../../hooks/useEmailMutations';
import { useEmails } from '../../hooks/useEmailQueries';
import { formatSwissDate } from '../../utils/localization';
import { useLanguage } from '@/lib/i18n/language-context';

export function SourceDocumentsPanel({ sourceModule, sourceRecordId, templateType, documentData = {}, language = 'de' }) {
  const { t, locale } = useLanguage();
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInit, setEmailInit] = useState({});
  const [preview, setPreview]     = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const { data: docs = [], refetch, isLoading } = useDocumentsBySource(sourceModule, sourceRecordId);
  const emailFilters = useMemo(
    () => ({ sourceModule, sourceRecordId, limit: 5 }),
    [sourceModule, sourceRecordId],
  );
  const { data: emails = [] } = useEmails(emailFilters, Boolean(sourceRecordId));
  const generate = useGenerateDocument();
  const compose  = useComposeEmail();
  const download = useDownloadDocument();
  const previewDocument = usePreviewDocument();

  const handleGenerate = async () => {
    await generate.mutateAsync({ templateType, sourceModule, sourceRecordId, data: documentData, language });
    refetch();
  };

  const handleEmailOpen = async () => {
    // Attach the selected documents, or fall back to the most recent one.
    const chosen = selectedIds.length
      ? docs.filter((doc) => selectedIds.includes(doc._id))
      : (docs[0] ? [docs[0]] : []);
    const attachments = chosen.map((doc) => ({ id: doc._id, fileName: doc.fileName }));
    const firstDoc = chosen[0];
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
      documentIds:     attachments.map((a) => a.id),
      attachments,
      sourceModule,
      sourceRecordId,
    });
    setEmailOpen(true);
  };

  const handlePreview = async (doc) => {
    const r = await previewDocument.mutateAsync(doc._id);
    setPreview({ url: r?.data?.previewUrl || r?.data?.downloadUrl, fileName: r?.data?.fileName || doc.fileName });
  };

  const handleDownload = async (doc) => {
    const r = await download.mutateAsync(doc._id);
    if (r?.data?.downloadUrl) await downloadFromUrl(r.data.downloadUrl, r.data.fileName || doc.fileName);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />{t('doctpl.documents')}
        </h4>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={generate.isPending} className="gap-1.5">
            {generate.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Plus className="h-3.5 w-3.5" />}
            {t('doctpl.generatePdf')}
          </Button>
          {docs.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={handleEmailOpen} className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />{t('common.send')}
            </Button>
          )}
        </div>
      </div>

      <DocumentsTable
        documents={docs}
        loading={isLoading}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onPreview={handlePreview}
        onDownload={handleDownload}
      />

      {emails.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('doctpl.emailHistory')}</p>
          {emails.map(email => (
            <div key={email._id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-t border-border/50">
              <span className="truncate">{email.to?.join(', ')}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span>{formatSwissDate(email.createdAt, locale)}</span>
                <EmailStatusBadge status={email.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      <EmailComposeModal open={emailOpen} onClose={() => setEmailOpen(false)} initialValues={emailInit} />
      <DocumentPreviewDrawer open={!!preview} url={preview?.url} fileName={preview?.fileName} onClose={() => setPreview(null)} />
    </div>
  );
}
