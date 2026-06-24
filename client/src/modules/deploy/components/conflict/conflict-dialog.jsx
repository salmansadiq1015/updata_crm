'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { CONFLICT_TYPE_META, CONFLICT_SEVERITY_META, translateMetaLabel } from '../../constants/deploy-constants';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

const OVERRIDE_REASON_MIN_LENGTH = 10;
const OVERRIDE_REASON_MIN_ROWS = 5;

const CONFLICT_TONE_CLASSES = Object.freeze({
  HARD: {
    card: 'border-red-500/35 bg-red-500/[0.08] shadow-[0_16px_40px_rgba(239,68,68,0.10)]',
    icon: 'border-red-400/25 bg-red-500/10 text-red-300',
    badge: 'bg-red-500/10 text-red-200 ring-red-500/25',
    marker: 'bg-red-400',
  },
  SOFT: {
    card: 'border-amber-500/35 bg-amber-500/[0.08] shadow-[0_16px_40px_rgba(245,158,11,0.10)]',
    icon: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
    badge: 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
    marker: 'bg-amber-400',
  },
});

export function ConflictDialog({ open, conflicts, onOverride, onCancel }) {
  const { t } = useLanguage();
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');

  const hasHardConflicts = conflicts?.some((conflict) => conflict.severity === 'HARD');
  const hasSoftConflicts = conflicts?.some((conflict) => conflict.severity === 'SOFT');
  const normalizedOverrideReason = overrideReason.trim();
  const canOverride = hasSoftConflicts && !hasHardConflicts;
  const isOverrideReasonValid = normalizedOverrideReason.length >= OVERRIDE_REASON_MIN_LENGTH;

  const handleOverride = () => {
    if (hasHardConflicts) return;
    if (!isOverrideReasonValid) {
      setError(t('deploy.conflicts.reasonRequired', 'Mindestens 10 Zeichen erforderlich'));
      return;
    }
    onOverride(normalizedOverrideReason);
    setOverrideReason('');
    setError('');
  };

  const handleCancel = () => {
    setOverrideReason('');
    setError('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) handleCancel(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start gap-4 pr-8">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
                hasHardConflicts
                  ? 'border-red-400/30 bg-red-500/10 text-red-300'
                  : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
              )}
            >
              {hasHardConflicts ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-xl">
                {t('deploy.conflicts.detected', 'Konflikte erkannt')}
              </DialogTitle>
              <DialogDescription className="leading-6">
                {hasHardConflicts
                  ? t('deploy.conflicts.hardInfo', 'Diese Verschiebung enthaelt harte Konflikte und kann nicht uebersteuert werden.')
                  : t('deploy.conflicts.planInfo', 'Die Planung verursacht folgende Konflikte:')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5 bg-muted/10 px-5 pb-8 pt-5 sm:px-7 sm:pb-9">
          <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
            {conflicts?.map((conflict, index) => {
              const typeMeta = CONFLICT_TYPE_META[conflict.conflictType];
              const severityMeta = CONFLICT_SEVERITY_META[conflict.severity];
              const Icon = conflict.severity === 'HARD' ? ShieldAlert : typeMeta?.icon || AlertTriangle;
              const typeLabel = translateMetaLabel(t, typeMeta);
              const severityLabel = translateMetaLabel(t, severityMeta);
              const tone = CONFLICT_TONE_CLASSES[conflict.severity] || CONFLICT_TONE_CLASSES.SOFT;

              return (
                <div
                  key={`${conflict.conflictType}-${index}`}
                  className={cn(
                    'relative overflow-hidden rounded-xl border p-4 transition-colors',
                    tone.card
                  )}
                >
                  <div className={cn('absolute inset-y-4 left-0 w-1 rounded-r-full', tone.marker)} />
                  <div className="flex items-start gap-3 pl-2">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', tone.icon)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal ring-1', tone.badge)}>
                          {severityLabel}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {typeLabel}
                        </span>
                      </div>
                      <p className="text-sm font-medium leading-5 text-foreground">
                        {conflict.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canOverride && (
            <FormField label={t('deploy.conflicts.overrideReason', 'Begruendung')} required error={error}>
              <Textarea
                aria-invalid={error ? 'true' : undefined}
                className="min-h-36 resize-y text-sm leading-6"
                rows={OVERRIDE_REASON_MIN_ROWS}
                placeholder={t('deploy.conflicts.reasonPlaceholder', 'Warum soll der Konflikt uebersteuert werden?')}
                value={overrideReason}
                onChange={(event) => { setOverrideReason(event.target.value); setError(''); }}
              />
            </FormField>
          )}
        </DialogBody>

        <DialogFooter className="px-5 py-4 sm:px-7 sm:py-5">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('deploy.common.cancel', 'Abbrechen')}
          </Button>
          {canOverride && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleOverride}
              disabled={!isOverrideReasonValid}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              {t('deploy.conflicts.override', 'Uebersteuern')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
