'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '@/modules/pm/services/document-service';
import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';
import { updateDocumentSchema } from '@/modules/pm/validations/document';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { DOCUMENT_CATEGORY_CONFIG, DOCUMENT_CATEGORIES } from '@/modules/pm/constants/pm-constants';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import {
  Plus, Pencil, Trash2, Loader2, Download, Upload,
  FileText, File, Image, FileSpreadsheet, FileArchive,
  Search, X, FolderOpen,
} from 'lucide-react';

// ── File icon by mime ─────────────────────────────────────────

function getFileIcon(mimeType) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z')) return FileArchive;
  if (mimeType.includes('pdf') || mimeType.includes('text') || mimeType.includes('document') || mimeType.includes('word')) return FileText;
  return File;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ── Document card ─────────────────────────────────────────────

function DocumentCard({ doc, language, canWrite, onEdit, onDelete, onDownload }) {
  const FileIcon = getFileIcon(doc.mimeType);
  const categoryCfg = DOCUMENT_CATEGORY_CONFIG[doc.category];
  const CategoryIcon = categoryCfg?.icon || FileText;

  return (
    <div className="group rounded-lg border bg-card p-4 shadow-theme-sm transition-all hover:shadow-theme-md">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{doc.originalName || doc.fileName}</span>
            {doc.isGenerated && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {language === 'de' ? 'Generiert' : 'Generated'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <CategoryIcon className="h-3 w-3" />
              {language === 'de' ? categoryCfg?.label : categoryCfg?.labelEn}
            </span>
            {doc.fileSize && (
              <span>{formatFileSize(doc.fileSize)}</span>
            )}
            {doc.createdAt && (
              <span>{formatDate(doc.createdAt)}</span>
            )}
            {doc.uploadedBy && typeof doc.uploadedBy === 'object' && (
              <span className="truncate">
                {`${doc.uploadedBy.firstName || ''} ${doc.uploadedBy.lastName || ''}`.trim()}
              </span>
            )}
          </div>
          {doc.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDownload(doc)} title={language === 'de' ? 'Herunterladen' : 'Download'}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          {canWrite && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(doc)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => onDelete(doc)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────

function UploadZone({ language, category, onUpload, isUploading }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback((files) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => onUpload(file));
  }, [onUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      )}
      onClick={() => fileRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {isUploading ? (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">{language === 'de' ? 'Wird hochgeladen...' : 'Uploading...'}</span>
        </div>
      ) : (
        <>
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">
            {language === 'de' ? 'Dateien hierher ziehen oder klicken' : 'Drag files here or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {language === 'de' ? 'Max. 50MB pro Datei' : 'Max 50MB per file'}
          </p>
        </>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────

export function DocumentsTab({ projectId }) {
  const { t, language } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('projects:write');

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [editDoc, setEditDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('OTHER');

  const params = useMemo(() => {
    const p = {};
    if (categoryFilter !== 'ALL') p.category = categoryFilter;
    return p;
  }, [categoryFilter]);

  const { data: docData, isLoading } = useQuery({
    queryKey: queryKeys.pm.documents.byProject(projectId, categoryFilter),
    queryFn: () => documentService.getDocuments(projectId, params),
    enabled: !!projectId,
  });

  const documents = useMemo(() => {
    const raw = docData?.documents || docData || [];
    return Array.isArray(raw) ? raw : [];
  }, [docData]);

  const filteredDocs = useMemo(() => {
    if (!searchTerm) return documents;
    const q = searchTerm.toLowerCase();
    return documents.filter((d) =>
      (d.originalName || d.fileName || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q)
    );
  }, [documents, searchTerm]);

  const { upload, updateMetadata, remove } = useDocumentMutations(projectId, {
    onDelete: () => setDeleteTarget(null),
  });

  const handleUpload = useCallback((file) => {
    upload.mutate({ file, options: { category: uploadCategory } });
  }, [upload, uploadCategory]);

  const handleDownload = useCallback(async (doc) => {
    try {
      const result = await documentService.getDownloadUrl(projectId, doc._id);
      const url = result?.url || result;
      if (url) window.open(url, '_blank');
    } catch {
      // Error already handled by toast in service
    }
  }, [projectId]);

  // ── Metadata edit form ─────────────────────────────────────

  const metaForm = useForm({
    resolver: zodResolver(updateDocumentSchema),
    defaultValues: { category: 'OTHER', description: '' },
  });

  const openEditDoc = (doc) => {
    setEditDoc(doc);
    metaForm.reset({ category: doc.category || 'OTHER', description: doc.description || '' });
  };

  const onMetaSubmit = (data) => {
    updateMetadata.mutate({ docId: editDoc._id, data });
    setEditDoc(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {canWrite && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs">{language === 'de' ? 'Kategorie für Upload' : 'Upload category'}</Label>
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <UploadZone
            language={language}
            category={uploadCategory}
            onUpload={handleUpload}
            isUploading={upload.isPending}
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder={language === 'de' ? 'Dokumente suchen...' : 'Search documents...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{language === 'de' ? 'Alle Kategorien' : 'All Categories'}</SelectItem>
            {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {filteredDocs.length} {language === 'de' ? 'Dokumente' : 'documents'}
        </span>
      </div>

      {/* Documents list */}
      {filteredDocs.length === 0 ? (
        <EmptyState
          title={t('pm.documents', 'Documents')}
          description={
            searchTerm
              ? (language === 'de' ? 'Keine Dokumente gefunden.' : 'No documents found.')
              : (language === 'de' ? 'Noch keine Dokumente hochgeladen.' : 'No documents uploaded yet.')
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <DocumentCard
              key={doc._id}
              doc={doc}
              language={language}
              canWrite={canWrite}
              onEdit={openEditDoc}
              onDelete={setDeleteTarget}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      {/* ── Metadata edit dialog ──────────────────────────── */}
      <Dialog open={!!editDoc} onOpenChange={(v) => { if (!v) setEditDoc(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'de' ? 'Metadaten bearbeiten' : 'Edit Metadata'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={metaForm.handleSubmit(onMetaSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{language === 'de' ? 'Kategorie' : 'Category'}</Label>
              <Select value={metaForm.watch('category')} onValueChange={(v) => metaForm.setValue('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('pm.description', 'Description')}</Label>
              <Controller
                name="description"
                control={metaForm.control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={language === 'de' ? 'Beschreibung...' : 'Description...'}
                    maxLength={5000}
                    minHeight={80}
                  />
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditDoc(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={updateMetadata.isPending}>
                {updateMetadata.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save', 'Save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={t('pm.documentDeleted', 'Delete Document')}
        description={language === 'de' ? `"${deleteTarget?.originalName || deleteTarget?.fileName}" wirklich löschen?` : `Delete "${deleteTarget?.originalName || deleteTarget?.fileName}"?`}
        onConfirm={() => remove.mutate(deleteTarget._id)}
        isLoading={remove.isPending}
        variant="destructive"
      />
    </div>
  );
}
