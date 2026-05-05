'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2 } from 'lucide-react';

export function FieldOpsRejectDialog({ open, onOpenChange, onConfirm, isLoading }) {
  const { t, locale: language } = useLanguage();
  const [note, setNote] = useState('');
  const noteError = note.trim().length > 0 && note.trim().length < 5;

  const handleConfirm = () => {
    if (!note.trim()) return;
    onConfirm(note.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setNote(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fieldOps.reports.reject', 'Reject Report')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-sm">{t('fieldOps.reports.rejectNote', 'Rejection reason (required)')}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={language === 'de' ? 'Grund für Ablehnung...' : 'Reason for rejection...'}
          />
          {noteError && <p className="text-xs text-destructive">{language === 'de' ? 'Mind. 5 Zeichen' : 'Min 5 chars'}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!note.trim() || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.reports.reject', 'Reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
