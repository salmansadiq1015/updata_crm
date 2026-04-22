'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transitionStatusSchema } from '@/modules/pm/validations/status';
import { STATUS_TRANSITIONS, PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProjectStatusBadge } from './project-status-badge';
import { cn } from '@/lib/utils';
import { Loader2, ArrowRight, AlertTriangle, ShieldAlert } from 'lucide-react';

export function StatusTransitionDialog({ open, onOpenChange, currentStatus, onSubmit, isLoading, canOverride }) {
  const { t, language } = useLanguage();
  const validTargets = STATUS_TRANSITIONS[currentStatus] || [];

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(transitionStatusSchema),
    defaultValues: {
      targetStatus: validTargets[0] || '',
      comment: '',
      override: false,
      overrideReason: '',
    },
  });

  const watchOverride = watch('override');
  const watchTarget = watch('targetStatus');

  const onFormSubmit = (data) => {
    const cleaned = { ...data };
    if (!cleaned.comment) delete cleaned.comment;
    if (!cleaned.override) {
      delete cleaned.override;
      delete cleaned.overrideReason;
    }
    onSubmit(cleaned);
  };

  const handleOpenChange = (val) => {
    if (!val) reset();
    onOpenChange(val);
  };

  if (validTargets.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            {t('pm.changeStatus', 'Change Status')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-5 pt-2">
          {/* Current → Target */}
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('pm.currentStatus', 'Current')}</Label>
              <ProjectStatusBadge status={currentStatus} />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-5" />
            <div className="space-y-1 flex-1">
              <Label className="text-xs text-muted-foreground">{t('pm.targetStatus', 'Target')}</Label>
              <Select value={watchTarget} onValueChange={(v) => setValue('targetStatus', v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {validTargets.map((s) => {
                    const cfg = PROJECT_STATUS_CONFIG[s];
                    return (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', cfg?.dotColor)} />
                          {language === 'de' ? cfg?.label : cfg?.labelEn}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('pm.comment', 'Comment')}
              {watchTarget === 'ON_HOLD' && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <Textarea {...register('comment')} rows={2} placeholder={language === 'de' ? 'Optionaler Kommentar...' : 'Optional comment...'} />
            {errors.comment && <p className="text-xs text-destructive">{errors.comment.message}</p>}
          </div>

          {/* Override */}
          {canOverride && (
            <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <Label className="text-xs font-medium">{t('pm.override', 'Override preconditions')}</Label>
                </div>
                <Switch
                  checked={watchOverride}
                  onCheckedChange={(v) => setValue('override', v)}
                />
              </div>
              {watchOverride && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t('pm.overrideReason', 'Override Reason')}<span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Textarea {...register('overrideReason')} rows={2} />
                  {errors.overrideReason && <p className="text-xs text-destructive">{errors.overrideReason.message}</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.confirm', 'Confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
