'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
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
import { Upload, Trash2, ImageIcon, X, Loader2, Maximize2 } from 'lucide-react';
import { IMAGE_CATEGORY_META } from '@/modules/crm/constants/crm-constants';

/**
 * Polymorphic images panel for sites and installations.
 * @param {Object} props
 * @param {'site'|'installation'} props.entityType
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

  const queryKey = entityType === 'site'
    ? queryKeys.crm.images.bySite(entityId)
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

  if (isLoading) return <ImagesSkeleton />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.images.title', 'Bilder')}</h3>
            <span className="text-xs text-muted-foreground">({images.length})</span>
          </div>
          <PermissionGate permission="crm:write">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {t('crm.images.upload', 'Bild hochladen')}
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

        {/* Upload dialog */}
        {pendingFile && (
          <Dialog open={!!pendingFile} onOpenChange={(v) => !v && setPendingFile(null)}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>{t('crm.images.uploadTitle', 'Bild hochladen')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <PendingPreview file={pendingFile} alt={t('crm.images.preview', 'Vorschau')} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">{t('crm.images.caption', 'Beschreibung')}</label>
                  <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('crm.images.captionPlaceholder', 'z.B. Typenschild Vorderseite')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">{t('crm.images.category', 'Kategorie')}</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(IMAGE_CATEGORY_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                              {t(`crm.images.category.${key}`, meta.label)}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setPendingFile(null)} disabled={uploadMut.isPending}>
                    {t('common.cancel', 'Abbrechen')}
                  </Button>
                  <Button onClick={uploadFile} disabled={uploadMut.isPending} className="gap-2">
                    {uploadMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {t('crm.images.uploading', 'Hochladen')}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {images.length === 0 ? (
          <EmptyState title={t('crm.images.empty', 'Keine Bilder')} description={t('crm.images.emptyDesc', 'Laden Sie Fotos hoch (z.B. Typenschild, Schäden).')} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
          </div>
        )}
      </CardContent>

      {/* Lightbox */}
      {lightbox && (
        <Dialog open onOpenChange={(v) => !v && setLightbox(null)}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <div className="relative bg-black/90">
              <img src={lightbox.url} alt={lightbox.caption || ''} className="w-full max-h-[80vh] object-contain" />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-white hover:bg-white/10"
                onClick={() => setLightbox(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {lightbox.caption && (
              <div className="p-4 border-t">
                <p className="text-sm">{lightbox.caption}</p>
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
    <div className="group/img relative aspect-square rounded-xl border border-border bg-muted/30 overflow-hidden">
      {img.url ? (
        <img
          src={img.thumbnailUrl || img.url}
          alt={img.caption || ''}
          className="h-full w-full object-cover transition-transform group-hover/img:scale-105"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}

      {/* Category badge */}
      <div className="absolute top-2 left-2">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md backdrop-blur-sm', meta.bg, meta.color)}>
          <Icon className="h-2.5 w-2.5" /> {t(`crm.images.category.${img.category}`, meta.label)}
        </span>
      </div>

      {/* Overlay actions */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity">
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
          {img.caption && (
            <p className="text-xs text-white truncate flex-1">{img.caption}</p>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-white/20" onClick={onView}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-red-500/30" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingPreview({ file, alt }) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!url) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <img src={url} alt={alt} className="w-full max-h-64 object-contain" />
    </div>
  );
}

function ImagesSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
