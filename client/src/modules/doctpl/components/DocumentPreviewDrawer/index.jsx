'use client';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadFromUrl } from '@/lib/api/download';
import { useLanguage } from '@/lib/i18n/language-context';

export function DocumentPreviewDrawer({ open, url, fileName, onClose }) {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <span className="text-sm font-medium truncate max-w-xs">{fileName || t('doctpl.documentPreview')}</span>
          <div className="flex items-center gap-2">
            {url && (
              <Button size="sm" variant="outline" onClick={() => downloadFromUrl(url, fileName || 'document')}>
                <Download className="h-3.5 w-3.5 mr-1.5" />{t('common.download')}
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {url
            ? <iframe src={url} className="h-full w-full border-0" title={t('doctpl.pdfPreview')} />
            : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('doctpl.noPreview')}</div>
          }
        </div>
      </div>
    </div>
  );
}
