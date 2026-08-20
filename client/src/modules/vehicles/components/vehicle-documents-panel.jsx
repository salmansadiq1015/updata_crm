'use client';

import { useRef, useState } from 'react';
import { Loader2, UploadCloud, FileUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';
import {
  useDocumentRepository,
  useDownloadRepositoryDocument,
  useDeleteRepositoryDocument,
  useUploadRepositoryDocument,
} from '@/modules/documents/hooks/use-document-repository';

/**
 * Reusable documents panel for a vehicle. Lists repository documents matching
 * `filters` and uploads new ones with the fixed `metadata` (e.g.
 * {sourceRecordType:'vehicle', sourceRecordId} for Fahrzeugdokumente or
 * {employeeId} for Fahrerunterlagen — centralised on the person).
 */
export function VehicleDocumentsPanel({ filters, metadata, canWrite = false, canDelete = false, description }) {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data, isLoading, error } = useDocumentRepository({ ...filters, sortOrder: 'desc', limit: 100 });
  const download = useDownloadRepositoryDocument();
  const remove = useDeleteRepositoryDocument();
  const documents = data?.items || [];

  const openDoc = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      if (payload?.downloadUrl) window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
      else showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const downloadDoc = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      if (payload?.downloadUrl) await downloadFromUrl(payload.downloadUrl, doc.fileName || doc.title || 'download');
      else showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (doc) => {
    setBusyId(doc.id);
    try {
      await remove.mutateAsync(doc.id);
      showSuccess(t('documents.repository.deleted', 'Dokument gelöscht'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : <span />}
        {canWrite && (
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setUploadOpen(true)}>
            <UploadCloud className="h-4 w-4" /> {t('vehicles.docs.upload', 'Dokument hochladen')}
          </Button>
        )}
      </div>

      <DocumentRepositoryTable
        documents={documents}
        loading={isLoading}
        error={error}
        onPreview={openDoc}
        onDownload={downloadDoc}
        onDelete={canDelete ? handleDelete : undefined}
        busyId={busyId}
        canDelete={canDelete}
      />

      <VehicleDocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} metadata={metadata} />
    </div>
  );
}

function VehicleDocumentUploadDialog({ open, onOpenChange, metadata = {} }) {
  const { t } = useLanguage();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const fileInputRef = useRef(null);
  const upload = useUploadRepositoryDocument();

  const reset = () => {
    setFile(null);
    setTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      showError(t('documents.repository.selectFileFirst', 'Bitte zuerst eine Datei wählen'));
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    if (title.trim()) fd.append('title', title.trim());
    for (const [k, v] of Object.entries(metadata)) {
      if (v != null && `${v}`.trim()) fd.append(k, `${v}`.trim());
    }
    try {
      await upload.mutateAsync(fd);
      showSuccess(t('documents.repository.uploaded', 'Dokument hochgeladen'));
      reset();
      onOpenChange(false);
    } catch (err) {
      showError(err);
    }
  };

  const handleOpenChange = (next) => {
    if (!next && !upload.isPending) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('vehicles.docs.uploadTitle', 'Dokument hochladen')}</DialogTitle>
          <DialogDescription>{t('vehicles.docs.uploadDesc', 'Die Datei wird diesem Fahrzeug bzw. Fahrer zugeordnet.')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="truncate text-sm font-medium">{file.name}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} disabled={upload.isPending}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full flex-col items-center justify-center gap-2 rounded-md py-6 text-sm text-muted-foreground transition hover:bg-background/70"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-6 w-6" />
                <span>{t('documents.repository.selectFileHelp', 'Datei auswählen')}</span>
              </button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-doc-title">{t('documents.repository.title', 'Titel')}</Label>
            <Input id="v-doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={file?.name || ''} disabled={upload.isPending} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={upload.isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {t('documents.repository.upload', 'Hochladen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
