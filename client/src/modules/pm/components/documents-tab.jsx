'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller } from 'react-hook-form';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '@/modules/pm/services/document-service';
import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';
import { updateDocumentSchema } from '@/modules/pm/validations/document';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { DOCUMENT_CATEGORY_CONFIG } from '@/modules/pm/constants/pm-constants';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DocumentViewer, getFileIcon, formatFileSize, isPreviewable } from '@/shared/components/document-viewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FormField, FormBody } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import {
  Pencil, Trash2, Loader2, Download, Upload,
  FileText, Search, X, FolderOpen, Eye,
  CloudUpload, FileUp, Grid3X3, List, LayoutGrid,
} from 'lucide-react';

// ── Document card (premium) ──────────────────────────────────

function DocumentCard({ doc, language, canWrite, onEdit, onDelete, onDownload, onPreview }) {
  const FileIcon = getFileIcon(doc.mimeType);
  const categoryCfg = DOCUMENT_CATEGORY_CONFIG[doc.category];
  const CategoryIcon = categoryCfg?.icon || FileText;

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border/60 bg-card p-4 transition-all duration-200 cursor-pointer',
        'hover:border-border hover:shadow-md hover:shadow-primary/[0.03]',
      )}
      onClick={() => onPreview(doc)}
    >
      <div className="flex items-start gap-3.5">
        <div className={cn(
          'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200',
          doc.mimeType?.startsWith('image/')
            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
            : doc.mimeType?.includes('pdf')
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : doc.mimeType?.includes('spreadsheet') || doc.mimeType?.includes('excel')
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-primary/8 text-primary',
        )}>
          <FileIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[13px] truncate leading-tight">{doc.originalName || doc.fileName}</span>
            {doc.isGenerated && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                {language === 'de' ? 'Generiert' : 'Generated'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1 bg-muted/60 rounded-md px-1.5 py-0.5">
              <CategoryIcon className="h-3 w-3" />
              {language === 'de' ? categoryCfg?.label : categoryCfg?.labelEn}
            </span>
            {doc.fileSize && (
              <span className="tabular-nums">{formatFileSize(doc.fileSize)}</span>
            )}
            {doc.createdAt && (
              <span>{formatDate(doc.createdAt)}</span>
            )}
            {doc.uploadedBy && typeof doc.uploadedBy === 'object' && (
              <span className="truncate max-w-[120px]">
                {`${doc.uploadedBy.firstName || ''} ${doc.uploadedBy.lastName || ''}`.trim()}
              </span>
            )}
          </div>

          {doc.description && (
            <p className="text-xs text-muted-foreground/70 mt-1.5 line-clamp-1">{doc.description}</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={(e) => { e.stopPropagation(); onPreview(doc); }}
            title={language === 'de' ? 'Vorschau' : 'Preview'}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={(e) => { e.stopPropagation(); onDownload(doc); }}
            title={language === 'de' ? 'Herunterladen' : 'Download'}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {canWrite && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={(e) => { e.stopPropagation(); onEdit(doc); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Document grid card ───────────────────────────────────────

function DocumentGridCard({ doc, language, canWrite, onEdit, onDelete, onDownload, onPreview }) {
  const FileIcon = getFileIcon(doc.mimeType);
  const categoryCfg = DOCUMENT_CATEGORY_CONFIG[doc.category];

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 cursor-pointer',
        'hover:border-border hover:shadow-md hover:shadow-primary/[0.03]',
      )}
      onClick={() => onPreview(doc)}
    >
      <div className={cn(
        'h-28 flex items-center justify-center relative',
        doc.mimeType?.startsWith('image/')
          ? 'bg-gradient-to-br from-violet-500/5 to-violet-500/10'
          : doc.mimeType?.includes('pdf')
            ? 'bg-gradient-to-br from-red-500/5 to-red-500/10'
            : doc.mimeType?.includes('spreadsheet') || doc.mimeType?.includes('excel')
              ? 'bg-gradient-to-br from-emerald-500/5 to-emerald-500/10'
              : 'bg-gradient-to-br from-muted/30 to-muted/60',
      )}>
        <FileIcon className={cn(
          'h-10 w-10',
          doc.mimeType?.startsWith('image/')
            ? 'text-violet-500/40'
            : doc.mimeType?.includes('pdf')
              ? 'text-red-500/40'
              : doc.mimeType?.includes('spreadsheet') || doc.mimeType?.includes('excel')
                ? 'text-emerald-500/40'
                : 'text-muted-foreground/30',
        )} />

        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg shadow-sm bg-background/90 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onPreview(doc); }}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg shadow-sm bg-background/90 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onDownload(doc); }}>
            <Download className="h-3 w-3" />
          </Button>
          {canWrite && (
            <>
              <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg shadow-sm bg-background/90 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onEdit(doc); }}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="secondary" size="icon" className="h-7 w-7 rounded-lg shadow-sm bg-background/90 backdrop-blur-sm text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(doc); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-3.5">
        <p className="text-[13px] font-medium truncate leading-tight">{doc.originalName || doc.fileName}</p>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 bg-muted/60 rounded-md px-1.5 py-0.5">
            {language === 'de' ? categoryCfg?.label : categoryCfg?.labelEn}
          </span>
          {doc.fileSize && <span className="tabular-nums">{formatFileSize(doc.fileSize)}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Premium upload zone ──────────────────────────────────────

function UploadZone({ language, onUpload, isUploading }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleFiles = useCallback((files) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => onUpload(file));
  }, [onUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer group overflow-hidden',
        dragging
          ? 'border-primary bg-primary/[0.04] scale-[1.01] shadow-lg shadow-primary/5'
          : 'border-border/60 hover:border-primary/40 hover:bg-muted/30',
      )}
      onClick={() => fileRef.current?.click()}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
    >
      {dragging && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-primary/[0.08] pointer-events-none" />
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {isUploading ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{language === 'de' ? 'Wird hochgeladen...' : 'Uploading...'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{language === 'de' ? 'Bitte warten' : 'Please wait'}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2 relative z-10">
          <div className={cn(
            'h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300',
            dragging
              ? 'bg-primary/15 scale-110'
              : 'bg-gradient-to-br from-primary/10 to-primary/5 group-hover:scale-105',
          )}>
            {dragging ? (
              <FileUp className="h-7 w-7 text-primary animate-bounce" />
            ) : (
              <CloudUpload className="h-7 w-7 text-primary/70 group-hover:text-primary transition-colors" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {dragging
                ? (language === 'de' ? 'Dateien hier ablegen' : 'Drop files here')
                : (language === 'de' ? 'Dateien hierher ziehen oder klicken' : 'Drag files here or click to browse')
              }
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {language === 'de' ? 'PDF, Bilder, Dokumente – max. 50 MB pro Datei' : 'PDF, images, documents – max 50MB per file'}
            </p>
          </div>
        </div>
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editDoc, setEditDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('OTHER');
  const [viewMode, setViewMode] = useState('list');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const params = useMemo(() => {
    const p = {};
    if (categoryFilter !== 'ALL') p.category = categoryFilter;
    if (dateFrom) p.startDate = new Date(dateFrom).toISOString();
    if (dateTo) {
      // Include the whole end day (server compares with $lte on createdAt).
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      p.endDate = end.toISOString();
    }
    return p;
  }, [categoryFilter, dateFrom, dateTo]);

  const { data: docData, isLoading } = useQuery({
    queryKey: queryKeys.pm.documents.byProject(projectId, categoryFilter, { dateFrom, dateTo }),
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
      // toast already handled in service
    }
  }, [projectId]);

  const handlePreview = useCallback(async (doc) => {
    try {
      const result = await documentService.getDownloadUrl(projectId, doc._id);
      const url = result?.url || result;
      setPreviewUrl(url);
      setPreviewDoc(doc);
    } catch {
      // fallback: open in new tab
      handleDownload(doc);
    }
  }, [projectId, handleDownload]);

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
      <div className="space-y-5">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 max-w-xs rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-18 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Upload area */}
      {canWrite && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <FormField label={language === 'de' ? 'Kategorie' : 'Category'} className="flex-row items-center gap-2 space-y-0">
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="w-44 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <UploadZone
            language={language}
            onUpload={handleUpload}
            isUploading={upload.isPending}
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder={language === 'de' ? 'Dokumente suchen...' : 'Search documents...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{language === 'de' ? 'Alle Kategorien' : 'All Categories'}</SelectItem>
            {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[140px] text-xs"
            title={language === 'de' ? 'Von' : 'From'}
            aria-label={language === 'de' ? 'Von Datum' : 'From date'}
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[140px] text-xs"
            title={language === 'de' ? 'Bis' : 'To'}
            aria-label={language === 'de' ? 'Bis Datum' : 'To date'}
          />
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              title={language === 'de' ? 'Datumsfilter zuruecksetzen' : 'Clear date filter'}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-0.5 ml-auto bg-muted/50 rounded-lg p-0.5 border border-border/40">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => setViewMode('list')}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>

        <span className="text-xs text-muted-foreground tabular-nums">
          {filteredDocs.length} {language === 'de' ? 'Dokumente' : 'documents'}
        </span>
      </div>

      {/* Documents */}
      {filteredDocs.length === 0 ? (
        <EmptyState
          title={t('pm.documents', 'Documents')}
          description={
            searchTerm
              ? (language === 'de' ? 'Keine Dokumente gefunden.' : 'No documents found.')
              : (language === 'de' ? 'Noch keine Dokumente hochgeladen.' : 'No documents uploaded yet.')
          }
        />
      ) : viewMode === 'list' ? (
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
              onPreview={handlePreview}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredDocs.map((doc) => (
            <DocumentGridCard
              key={doc._id}
              doc={doc}
              language={language}
              canWrite={canWrite}
              onEdit={openEditDoc}
              onDelete={setDeleteTarget}
              onDownload={handleDownload}
              onPreview={handlePreview}
            />
          ))}
        </div>
      )}

      {/* ── Document viewer ───────────────────────────────── */}
      <DocumentViewer
        open={!!previewDoc}
        onOpenChange={(v) => { if (!v) { setPreviewDoc(null); setPreviewUrl(null); } }}
        doc={previewDoc}
        url={previewUrl}
        docs={filteredDocs}
        onNavigate={handlePreview}
      />

      {/* ── Metadata edit dialog ──────────────────────────── */}
      <Dialog open={!!editDoc} onOpenChange={(v) => { if (!v) setEditDoc(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              {language === 'de' ? 'Metadaten bearbeiten' : 'Edit Metadata'}
            </DialogTitle>
            <DialogDescription>
              {editDoc?.originalName || editDoc?.fileName}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={metaForm.handleSubmit(onMetaSubmit)} className="flex flex-1 flex-col overflow-hidden">
            <FormBody>
              <FormField label={language === 'de' ? 'Kategorie' : 'Category'}>
                <Select value={metaForm.watch('category')} onValueChange={(v) => metaForm.setValue('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_CATEGORY_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{language === 'de' ? cfg.label : cfg.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={t('pm.description', 'Description')}>
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
              </FormField>
            </FormBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDoc(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={updateMetadata.isPending} className="gap-2">
                {updateMetadata.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={t('pm.documentDeleted', 'Delete Document')}
        description={language === 'de' ? `"${deleteTarget?.originalName || deleteTarget?.fileName}" wirklich loeschen?` : `Delete "${deleteTarget?.originalName || deleteTarget?.fileName}"?`}
        onConfirm={() => remove.mutate(deleteTarget._id)}
        isLoading={remove.isPending}
        variant="destructive"
      />
    </div>
  );
}
