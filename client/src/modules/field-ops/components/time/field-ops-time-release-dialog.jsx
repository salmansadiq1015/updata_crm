'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2 } from 'lucide-react';

export function FieldOpsTimeReleaseDialog({ open, onOpenChange, count, onConfirm, isLoading }) {
  const { t, locale: language } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fieldOps.time.release', 'Release Time Entries')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          {language === 'de'
            ? `${count} Zeiteintrag${count !== 1 ? 'e' : ''} freigeben?`
            : `Release ${count} time entr${count !== 1 ? 'ies' : 'y'}?`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {language === 'de' ? 'Abbrechen' : 'Cancel'}
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.time.release', 'Release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
