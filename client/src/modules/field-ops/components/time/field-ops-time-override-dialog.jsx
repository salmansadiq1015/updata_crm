'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2, ShieldAlert } from 'lucide-react';

export function FieldOpsTimeOverrideDialog({ open, onOpenChange, onConfirm, isLoading }) {
  const { t, language } = useLanguage();
  const [justification, setJustification] = useState('');
  const tooShort = justification.trim().length > 0 && justification.trim().length < 20;
  const valid = justification.trim().length >= 20;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setJustification(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            {t('fieldOps.time.overrideRelease', 'Override Release')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-sm">{t('fieldOps.time.overrideJustification', 'Justification (min 20 chars)')}</Label>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder={language === 'de' ? 'Begründung eingeben...' : 'Enter justification...'}
          />
          {tooShort && (
            <p className="text-xs text-destructive">
              {language === 'de'
                ? `Noch ${20 - justification.trim().length} Zeichen`
                : `${20 - justification.trim().length} more chars needed`}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {language === 'de' ? 'Abbrechen' : 'Cancel'}
          </Button>
          <Button variant="default" onClick={() => onConfirm(justification)} disabled={!valid || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.time.overrideRelease', 'Override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
