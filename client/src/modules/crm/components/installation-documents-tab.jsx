'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, FolderOpen, Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';
import { cn } from '@/lib/utils';
import {
  useArchiveRepositoryDocument,
  useDocumentRepository,
  useDownloadRepositoryDocument,
  useDownloadRepositoryDocumentAttachment,
  useUploadRepositoryDocument,
} from '@/modules/documents/hooks/use-document-repository';
import { DocumentRepositoryTable } from '@/modules/documents/components/document-repository-table';
import { DOCUMENT_SECTIONS, documentSectionOf } from '@/modules/pm/constants/pm-constants';
import {
  DOCUMENT_CATEGORY_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
} from '@/modules/documents/utils/document-formatters';

/**
 * Documents tab for an installation (Komponente).
 *
 * Default view: only documents directly uploaded for this installation
 * (technical data sheets, etc.).
 * Toggle "Alle Dokumente": shows every document from the parent site's
 * projects (same view as the Objekt > Dokumente tab).
 */
export function InstallationDocumentsTab({ installationId, siteId }) {
  const { t, language } = useLanguage();
  const [busyId, setBusyId] = useState(null);
  const [activeSection, setActiveSection] = useState('documents');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const queryParams = showAll
    ? { siteId, sortOrder: 'desc', limit: 100 }
    : { installationId, sortOrder: 'desc', limit: 100 };
  const { data, isLoading, error } = useDocumentRepository(queryParams);
  const download = useDownloadRepositoryDocument();
  const downloadAttachment = useDownloadRepositoryDocumentAttachment();
  const archiveMutation = useArchiveRepositoryDocument();

  const documents = data?.items || [];

  const sectionCounts = useMemo(() => {
    const counts = { documents: 0, visum: 0, archiv: 0 };
    for (const d of documents) counts[documentSectionOf(d)] += 1;
    return counts;
  }, [documents]);

  const sectionDocs = useMemo(
    () => documents.filter((d) => documentSectionOf(d) === activeSection),
    [documents, activeSection],
  );

  const openDocument = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await download.mutateAsync(doc.id);
      if (payload?.downloadUrl) {
        window.open(payload.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (doc) => {
    setBusyId(doc.id);
    try {
      const payload = await downloadAttachment.mutateAsync(doc.id);
      if (payload?.downloadUrl) {
        await downloadFromUrl(payload.downloadUrl, payload.fileName || doc.fileName);
      } else {
        showError(t('documents.repository.noDownloadUrl', 'Kein Download-Link verfügbar'));
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (doc) => {
    setBusyId(doc.id);
    try {
      const newArchived = !doc.archived;
      await archiveMutation.mutateAsync({ id: doc.id, archived: newArchived });
      showSuccess(t(newArchived ? 'documents.repository.archived' : 'documents.repository.unarchived'));
    } catch (err) {
      showError(err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {showAll
            ? t('crm.installations.documentsDescAll', 'Alle Dokumente aus den Projekten dieses Objekts.')
            : t('crm.installations.documentsDesc', 'Dokumente dieser Komponente (z.B. Technische Daten).')}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant={showAll ? 'secondary' : 'outline'}
            className="gap-1.5"
            onClick={() => { setShowAll((v) => !v); setActiveSection('documents'); }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {showAll
              ? t('crm.installations.showComponentDocs', 'Nur Komponente')
              : t('crm.installations.showAllDocs', 'Alle Dokumente')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <UploadCloud className="h-3.5 w-3.5" />
            {t('documents.repository.upload', 'Hochladen')}
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {DOCUMENT_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const active = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active ? section.activeCls : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <SectionIcon className="h-3.5 w-3.5" />
              {language === 'de' ? section.label : section.labelEn}
              <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? section.badgeCls : 'bg-muted text-muted-foreground')}>
                {sectionCounts[section.id]}
              </span>
            </button>
          );
        })}
      </div>

      <DocumentRepositoryTable
        documents={sectionDocs}
        loading={isLoading}
        error={error}
        onPreview={openDocument}
        onDownload={handleDownload}
        onArchive={handleArchive}
        busyId={busyId}
      />

      <InstallationUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        installationId={installationId}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simplified upload dialog — pre-fills installationId, hides links  */
/* ------------------------------------------------------------------ */

function InstallationUploadDialog({ open, onOpenChange, installationId }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('OTHER');
  const [category, setCategory] = useState('TECHNICAL');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef(null);
  const upload = useUploadRepositoryDocument();
  const { t } = useLanguage();

  const reset = () => {
    setFile(null);
    setTitle('');
    setDocumentType('OTHER');
    setCategory('TECHNICAL');
    setDescription('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      showError(t('documents.repository.selectFileFirst', 'Bitte zuerst eine Datei auswählen'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (title.trim()) formData.append('title', title.trim());
    formData.append('documentType', documentType);
    formData.append('category', category);
    if (description.trim()) formData.append('description', description.trim());
    formData.append('installationId', installationId);
    formData.append('sourceRecordType', 'installation');
    formData.append('sourceRecordId', installationId);

    try {
      await upload.mutateAsync(formData);
      showSuccess(t('documents.repository.uploaded', 'Dokument hochgeladen'));
      reset();
      onOpenChange?.(false);
    } catch (err) {
      showError(err);
    }
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !upload.isPending) reset();
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('crm.installations.uploadDocTitle', 'Dokument hochladen')}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background">
                    <FileUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.type || t('documents.repository.unknownFileType', 'Unbekannter Dateityp')}</p>
                  </div>
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
                <span>{t('documents.repository.selectFileHelp', 'Datei auswählen oder hierher ziehen')}</span>
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inst-doc-title">{t('documents.repository.title', 'Titel')}</Label>
              <Input
                id="inst-doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={file?.name || t('documents.repository.optionalTitle', 'Optional')}
                disabled={upload.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('documents.repository.documentType', 'Dokumenttyp')}</Label>
              <Select value={documentType} onValueChange={setDocumentType} disabled={upload.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('documents.repository.category', 'Kategorie')}</Label>
              <Select value={category} onValueChange={setCategory} disabled={upload.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inst-doc-desc">{t('documents.repository.descriptionField', 'Beschreibung')}</Label>
            <Textarea
              id="inst-doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={upload.isPending}
            />
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
