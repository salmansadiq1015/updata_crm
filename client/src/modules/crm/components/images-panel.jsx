'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { imageService } from '@/modules/crm/services/image-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Upload, Trash2, ImageIcon, X, Loader2, Maximize2, CloudUpload, CheckCircle2, FileImage, RotateCcw, Download } from 'lucide-react';
import { IMAGE_CATEGORY_META } from '@/modules/crm/constants/crm-constants';

/**
 * Polymorphic images panel for sites, installations and customers.
 * @param {Object} props
 * @param {'site'|'installation'|'customer'} props.entityType
 * @param {string} props.entityId
 */
export function ImagesPanel({ entityType, entityId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const fileRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('general');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  // Drag-over state for the drop zone
  const [isDragOver, setIsDragOver] = useState(false);

  const queryKey = entityType === 'site'
    ? queryKeys.crm.images.bySite(entityId)
    : entityType === 'customer'
      ? queryKeys.crm.images.byCustomer(entityId)
      : queryKeys.crm.images.byInstallation(entityId);

  const { data: images = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => imageService.listByEntity(entityType, entityId),
    enabled: !!entityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const uploadMut = useMutation({
    mutationFn: ({ file, meta }) => imageService.uploadForEntity(entityType, entityId, file, meta),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.images.uploadedToast', 'Bild hochgeladen'));
      setPendingFile(null);
      setCaption('');
      setCategory('general');
    },
    onError: (err) => showError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => imageService.delete(id),
    onSuccess: () => { invalidate(); showSuccess(t('crm.images.deletedToast', 'Bild gelöscht')); setDeleteTarget(null); },
    onError: (err) => showError(err.message),
  });

  const onFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showError(t('crm.images.fileTooLarge', 'Datei zu gross (max 5MB)'));
      return;
    }
    setPendingFile(file);
  };

  const uploadFile = () => {
    if (!pendingFile) return;
    uploadMut.mutate({ file: pendingFile, meta: { caption, category, sortOrder: images.length } });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Nur Bilddateien erlaubt'); return; }
    if (file.size > 5 * 1024 * 1024) { showError(t('crm.images.fileTooLarge', 'Max 5 MB')); return; }
    setPendingFile(file);
  }, [t]);

  if (isLoading) return <ImagesSkeleton />;

  return (
    <Card className="rounded-2xl border-border/60 bg-card shadow-theme-sm dark:border-white/[0.07] dark:bg-[#0D1117]">
      <CardContent className="p-5">
        {/* Panel header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-violet-500/10">
              <ImageIcon className="h-4 w-4 text-violet-400" />
            </div>
            <h3 className="text-[14px] font-semibold text-foreground">{t('crm.images.title', 'Bilder')}</h3>
            {images.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-white/[0.06] dark:text-white/45">
                {images.length}
              </span>
            )}
          </div>
          <PermissionGate permission="crm:write">
            <Button
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="h-8 gap-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/25 hover:border-violet-500/40 transition-all text-[12px] font-medium"
            >
              <Upload className="h-3 w-3" /> {t('crm.images.upload', 'Hochladen')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFileSelect}
              className="hidden"
            />
          </PermissionGate>
        </div>

        {/* Premium Upload dialog */}
        {pendingFile && (
          <UploadImageDialog
            file={pendingFile}
            caption={caption}
            category={category}
            isPending={uploadMut.isPending}
            onCaptionChange={setCaption}
            onCategoryChange={setCategory}
            onUpload={uploadFile}
            onClose={() => { setPendingFile(null); setCaption(''); setCategory('general'); }}
            onReplace={() => { fileRef.current?.click(); }}
            t={t}
          />
        )}

        {images.length === 0 ? (
          /* Drop zone empty state */
          <PermissionGate permission="crm:write" fallback={
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/25 dark:text-white/10" />
              <p className="text-[13px] text-muted-foreground">{t('crm.images.empty', 'Keine Bilder')}</p>
            </div>
          }>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              className={cn(
                'w-full flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer',
                isDragOver
                  ? 'border-violet-500/60 bg-violet-500/[0.07]'
                  : 'border-border bg-muted/30 hover:border-violet-500/30 hover:bg-violet-500/[0.04] dark:border-white/[0.08] dark:bg-white/[0.02]'
              )}
            >
              <div className={cn(
                'h-14 w-14 rounded-2xl flex items-center justify-center transition-colors',
                isDragOver ? 'bg-violet-500/20' : 'bg-muted dark:bg-white/[0.05]'
              )}>
                <CloudUpload className={cn('h-6 w-6', isDragOver ? 'text-violet-500 dark:text-violet-400' : 'text-muted-foreground dark:text-white/25')} />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-foreground">
                  {isDragOver ? 'Bild hier ablegen' : t('crm.images.dropzone', 'Bild hierher ziehen oder klicken')}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">JPEG, PNG, WebP · max 5 MB</p>
              </div>
            </button>
          </PermissionGate>
        ) : (
          /* Gallery grid */
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            onDrop={canWrite ? handleDrop : undefined}
            onDragOver={canWrite ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
            onDragLeave={canWrite ? () => setIsDragOver(false) : undefined}
          >
            {images.map((img) => (
              <ImageTile
                key={img._id}
                image={img}
                canDelete={canDelete}
                onDelete={() => setDeleteTarget(img)}
                onView={() => setLightbox(img)}
                t={t}
              />
            ))}
            {/* Add more tile */}
            {canWrite && (
              <button
                onClick={() => fileRef.current?.click()}
                className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 transition-all hover:border-violet-500/30 hover:bg-violet-500/[0.04] dark:border-white/[0.08] dark:bg-white/[0.02]"
              >
                <Upload className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-violet-500 dark:text-white/20 dark:group-hover:text-violet-400" />
                <span className="text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-violet-500 dark:text-white/25 dark:group-hover:text-violet-400">Hinzufügen</span>
              </button>
            )}
          </div>
        )}
      </CardContent>

      {/* Premium Lightbox */}
      {lightbox && (
        <Dialog open onOpenChange={(v) => !v && setLightbox(null)}>
          <DialogContent className="max-w-4xl p-0 gap-0 rounded-2xl border border-white/[0.08] bg-[#060A10] shadow-2xl overflow-hidden">
            <DialogTitle className="sr-only">
              {lightbox.caption || t('crm.images.preview', 'Bildvorschau')}
            </DialogTitle>
            {/* Image area */}
            <div className="relative">
              <img
                src={lightbox.url}
                alt={lightbox.caption || ''}
                className="w-full max-h-[75vh] object-contain select-none"
              />
              {/* Top-right actions: download original + close */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <a
                  href={lightbox.url}
                  download={lightbox.caption || 'image'}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('crm.images.download', 'Original herunterladen')}
                  className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/[0.12] text-white/70 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/[0.12] text-white/70 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Category badge */}
              {lightbox.category && (() => {
                const m = IMAGE_CATEGORY_META[lightbox.category] || IMAGE_CATEGORY_META.general;
                const I = m.icon;
                return (
                  <div className="absolute top-3 left-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md border border-white/[0.10]', m.bg, m.color)}>
                      <I className="h-3 w-3" />{m.label}
                    </span>
                  </div>
                );
              })()}
            </div>
            {/* Caption footer */}
            {lightbox.caption && (
              <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center gap-3">
                <ImageIcon className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <p className="text-[13px] text-white/70">{lightbox.caption}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('crm.images.confirmDelete', 'Bild löschen?')}
        description={t('crm.images.deleteDesc', 'Diese Aktion kann nicht rückgängig gemacht werden.')}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
      />
    </Card>
  );
}

function ImageTile({ image: img, canDelete, onDelete, onView, t }) {
  const meta = IMAGE_CATEGORY_META[img.category] || IMAGE_CATEGORY_META.general;
  const Icon = meta.icon;

  return (
    <div className="group/img relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm transition-shadow hover:shadow-theme-md dark:border-white/[0.07] dark:bg-[#060A10] dark:hover:shadow-black/30">
      {img.url ? (
        <img
          src={img.thumbnailUrl || img.url}
          alt={img.caption || ''}
          className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-105"
          onClick={onView}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/50 dark:bg-white/[0.03]">
          <ImageIcon className="h-8 w-8 text-muted-foreground/35 dark:text-white/15" />
        </div>
      )}

      {/* Category badge — top left */}
      <div className="absolute top-2 left-2 z-10">
        <span className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm border border-border/60 dark:border-white/[0.08]',
          meta.bg, meta.color
        )}>
          <Icon className="h-2.5 w-2.5" />
          {t(`crm.images.category.${img.category}`, meta.label)}
        </span>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 z-10" onClick={onView}>
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          {img.caption && (
            <p className="text-[11px] text-white/85 font-medium truncate mb-1.5">{img.caption}</p>
          )}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onView(); }}
              className="h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm flex items-center justify-center text-white transition-all border border-white/[0.10]"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="h-7 w-7 rounded-lg bg-red-500/20 hover:bg-red-500/35 backdrop-blur-sm flex items-center justify-center text-red-300 transition-all border border-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Premium Upload Dialog ───────────────────────────────────────────────────

function UploadImageDialog({ file, caption, category, isPending, onCaptionChange, onCategoryChange, onUpload, onClose, onReplace, t }) {
  // StrictMode-safe object URL: create it INSIDE the effect and revoke the same
  // instance in cleanup. (Using useMemo here breaks in dev StrictMode — the effect
  // cleanup revokes the blob but useMemo never recreates it, leaving a dead src.)
  const [url, setUrl] = useState(null);
  useEffect(() => {
    // Object URLs are external browser resources; create/revoke them after commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file) { setUrl(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const activeMeta = IMAGE_CATEGORY_META[category] || IMAGE_CATEGORY_META.general;
  const ActiveIcon = activeMeta.icon;

  const fileSizeLabel = useMemo(() => {
    if (!file) return '';
    const kb = file.size / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  }, [file]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-lg dark:border-white/[0.08] dark:bg-[#0D1117]">

        {/* ── Fixed Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div className="p-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
            <CloudUpload className="h-5 w-5 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[16px] font-semibold leading-tight text-foreground">
              {t('crm.images.uploadTitle', 'Bild hochladen')}
            </DialogTitle>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t('crm.images.uploadSubtitle', 'Bild prüfen, beschriften und Kategorie wählen')}
            </p>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Image preview card */}
          <div className="relative rounded-2xl overflow-hidden bg-[#060A10] ring-1 ring-white/[0.07] group min-h-[13rem] flex items-center justify-center">
            {/* Gradient overlay at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#060A10]/90 via-transparent to-transparent pointer-events-none z-10" />

            {/* The image */}
            {url ? (
              <img
                src={url}
                alt={caption || t('crm.images.preview', 'Vorschau')}
                className="w-full object-contain max-h-72 select-none"
              />
            ) : (
              <div className="h-52 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white/15 animate-spin" />
              </div>
            )}

            {/* File info strip pinned at bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">
                  {file?.name}
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">{fileSizeLabel}</p>
              </div>
              {/* Replace button */}
              <button
                onClick={onReplace}
                className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-white/50 hover:text-white/80 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-lg px-2.5 py-1.5 transition-all"
              >
                <RotateCcw className="h-3 w-3" />
                {t('crm.images.replace', 'Ersetzen')}
              </button>
            </div>

            {/* Category badge — top-left */}
            <div className="absolute top-3 left-3 z-20">
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md border',
                activeMeta.bg, activeMeta.color,
                'border-white/[0.10]'
              )}>
                <ActiveIcon className="h-3 w-3" />
                {t(`crm.images.category.${category}`, activeMeta.label)}
              </span>
            </div>

            {/* Ready indicator — top-right */}
            <div className="absolute top-3 right-3 z-20">
              <div className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-medium px-2 py-1 rounded-full backdrop-blur-md">
                <CheckCircle2 className="h-3 w-3" />
                Bereit
              </div>
            </div>
          </div>

          {/* Caption field */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-muted-foreground">
              {t('crm.images.caption', 'Beschreibung')}
              <span className="ml-1 font-normal text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder={t('crm.images.captionPlaceholder', 'z.B. Typenschild Vorderseite')}
              className="h-9 rounded-lg border-input bg-muted/40 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/90 dark:placeholder:text-white/25"
            />
          </div>

          {/* Category picker — visual cards */}
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-muted-foreground">
              {t('crm.images.category', 'Kategorie')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(IMAGE_CATEGORY_META).map(([key, meta]) => {
                const Icon = meta.icon;
                const isActive = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onCategoryChange(key)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150',
                      isActive
                        ? cn('border-current/30 ring-1 ring-current/20', meta.bg, meta.color)
                        : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/45 dark:hover:bg-white/[0.07] dark:hover:text-white/70'
                    )}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                      isActive ? cn(meta.bg, 'ring-1 ring-current/25') : 'bg-background dark:bg-white/[0.05]'
                    )}>
                      <Icon className={cn('h-3.5 w-3.5', isActive ? meta.color : 'text-muted-foreground dark:text-white/30')} />
                    </div>
                    <span className="text-[12.5px] font-medium leading-tight">
                      {t(`crm.images.category.${key}`, meta.label)}
                    </span>
                    {isActive && (
                      <CheckCircle2 className={cn('h-3.5 w-3.5 ml-auto shrink-0', meta.color)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Fixed Footer ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4 dark:border-white/[0.06]">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/50 dark:hover:bg-white/[0.05] dark:hover:text-white/80"
          >
            {t('common.cancel', 'Abbrechen')}
          </Button>
          <Button
            onClick={onUpload}
            disabled={isPending}
            className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-[0_0_20px_oklch(0.65_0.25_292_/_30%)] hover:shadow-[0_0_28px_oklch(0.65_0.25_292_/_45%)] transition-all px-5"
          >
            {isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('crm.images.uploading', 'Wird hochgeladen…')}</>
              : <><CloudUpload className="h-3.5 w-3.5" />{t('crm.images.upload', 'Hochladen')}</>
            }
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function ImagesSkeleton() {
  return (
    <Card className="rounded-2xl border-border/60 bg-card shadow-theme-sm dark:border-white/[0.07] dark:bg-[#0D1117]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl bg-muted dark:bg-white/[0.05]" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
