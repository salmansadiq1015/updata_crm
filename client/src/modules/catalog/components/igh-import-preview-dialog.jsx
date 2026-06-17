'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

export function IghImportPreviewDialog({ open, onClose, preview, onConfirm, isImporting }) {
  const { t } = useLanguage();
  if (!preview) return null;
  const data = preview.previewData ?? preview;
  const validationErrors = data.validationErrors ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('catalog.igh.preview.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t('catalog.igh.preview.articlesFound', null, { count: (data.total ?? 0).toLocaleString() })}
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-green-600">{(data.newCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('catalog.igh.preview.new')}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-blue-600">{(data.updatedCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('catalog.igh.preview.updated')}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-amber-600">{(data.obsoleteCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('catalog.igh.preview.obsolete')}</p>
            </div>
          </div>
          {(data.obsoleteCount ?? 0) > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('catalog.igh.preview.obsoleteWarning', null, { count: data.obsoleteCount })}
            </p>
          )}
          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {t('catalog.igh.preview.validationErrors', null, { count: validationErrors.length })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isImporting}>{t('common.cancel')}</Button>
          <Button onClick={onConfirm} disabled={isImporting}>
            {isImporting ? t('catalog.igh.preview.approving') : t('catalog.igh.preview.approveImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
