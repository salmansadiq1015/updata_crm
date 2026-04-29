'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transitionStatusSchema } from '@/modules/pm/validations/status';
import { STATUS_TRANSITIONS, PROJECT_STATUS_CONFIG } from '@/modules/pm/constants/pm-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormBody } from '@/components/ui/form-field';
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4.5 w-4.5 text-primary" />
            {t('pm.changeStatus', 'Change Status')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <FormBody>
            <div className="flex items-center gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-medium text-foreground/80">{t('pm.currentStatus', 'Current')}</Label>
                <ProjectStatusBadge status={currentStatus} />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-5" />
              <FormField label={t('pm.targetStatus', 'Target')} className="flex-1">
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
              </FormField>
            </div>

            <FormField
              label={t('pm.comment', 'Comment')}
              required={watchTarget === 'ON_HOLD'}
              error={errors.comment?.message}
            >
              <Textarea {...register('comment')} rows={2} placeholder={language === 'de' ? 'Optionaler Kommentar...' : 'Optional comment...'} />
            </FormField>

            {canOverride && (
              <div className="space-y-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <Label className="text-[13px] font-medium">{t('pm.override', 'Override preconditions')}</Label>
                  </div>
                  <Switch
                    checked={watchOverride}
                    onCheckedChange={(v) => setValue('override', v)}
                  />
                </div>
                {watchOverride && (
                  <FormField label={t('pm.overrideReason', 'Override Reason')} required error={errors.overrideReason?.message}>
                    <Textarea {...register('overrideReason')} rows={2} />
                  </FormField>
                )}
              </div>
            )}
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.confirm', 'Confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
