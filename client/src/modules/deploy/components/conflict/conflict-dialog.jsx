'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { CONFLICT_TYPE_META, CONFLICT_SEVERITY_META } from '../../constants/deploy-constants';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

export function ConflictDialog({ open, onOpenChange, conflicts, onOverride, onCancel }) {
  const { t } = useLanguage();
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');

  const hasHardConflicts = conflicts?.some((c) => c.severity === 'HARD');
  const hasSoftConflicts = conflicts?.some((c) => c.severity === 'SOFT');

  const handleOverride = () => {
    if (overrideReason.length < 10) {
      setError(t('deploy.conflicts.reasonRequired', 'Mindestens 10 Zeichen erforderlich'));
      return;
    }
    onOverride(overrideReason);
    setOverrideReason('');
    setError('');
  };

  const handleCancel = () => {
    setOverrideReason('');
    setError('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {t('deploy.conflicts.detected', 'Konflikte erkannt')}
          </DialogTitle>
          <DialogDescription>
            {t('deploy.conflicts.moveInfo', 'Die Verschiebung verursacht folgende Konflikte:')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {conflicts?.map((conflict, i) => {
            const typeMeta = CONFLICT_TYPE_META[conflict.conflictType];
            const severityMeta = CONFLICT_SEVERITY_META[conflict.severity];
            const Icon = typeMeta?.icon || AlertTriangle;

            return (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  severityMeta?.bg,
                  severityMeta?.borderColor
                )}
              >
                <div className={cn('mt-0.5', severityMeta?.color)}>
                  {conflict.severity === 'HARD'
                    ? <ShieldAlert className="h-4 w-4" />
                    : <Icon className="h-4 w-4" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('text-xs font-semibold', severityMeta?.color)}>
                      {severityMeta?.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {typeMeta?.label}
                    </span>
                  </div>
                  <p className="text-xs text-foreground">{conflict.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <FormField label={t('deploy.conflicts.overrideReason', 'Begründung')} required error={error}>
          <Textarea
            className="text-xs min-h-[60px]"
            placeholder={t('deploy.conflicts.reasonPlaceholder', 'Warum soll der Konflikt übersteuert werden?')}
            value={overrideReason}
            onChange={(e) => { setOverrideReason(e.target.value); setError(''); }}
          />
        </FormField>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('deploy.common.cancel', 'Abbrechen')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleOverride}
            disabled={overrideReason.length < 10}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            {t('deploy.conflicts.override', 'Übersteuern')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
