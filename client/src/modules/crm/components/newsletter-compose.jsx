'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n/language-context';
import { newsletterService } from '@/modules/crm/services/newsletter-service';
import { queryKeys } from '@/lib/query/keys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Loader2, Send, Clock, Save, Users, ShieldCheck,
} from 'lucide-react';

const BLANK_VALUES = {
  subject: '',
  bodyHtml: '',
  bodyText: '',
  channels: ['email'],
  recipientFilter: {},
  scheduledAt: '',
};

export function NewsletterCompose({
  open,
  onOpenChange,
  newsletter,
  onCreate,
  onUpdate,
  onSchedule,
  onSend,
  isCreating,
  isUpdating,
}) {
  const { t } = useLanguage();
  const isEdit = !!newsletter;
  const isReadOnly = newsletter && !['draft', 'scheduled'].includes(newsletter.status);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: BLANK_VALUES,
  });

  const recipientFilter = watch('recipientFilter');
  const scheduledAt = watch('scheduledAt');

  // Load recipient count preview
  const { data: recipientData, isFetching: countingRecipients } = useQuery({
    queryKey: queryKeys.crm.newsletters.recipientCount(recipientFilter),
    queryFn: () => newsletterService.countRecipients(recipientFilter || {}),
    enabled: open,
    staleTime: 30_000,
  });

  const recipientCount = recipientData?.count ?? 0;

  // Reset form when opening or switching newsletter
  useEffect(() => {
    if (open) {
      if (newsletter) {
        reset({
          subject: newsletter.subject || '',
          bodyHtml: newsletter.bodyHtml || '',
          bodyText: newsletter.bodyText || '',
          channels: newsletter.channels || ['email'],
          recipientFilter: newsletter.recipientFilter || {},
          scheduledAt: newsletter.scheduledAt
            ? new Date(newsletter.scheduledAt).toISOString().slice(0, 16)
            : '',
        });
      } else {
        reset(BLANK_VALUES);
      }
    }
  }, [open, newsletter, reset]);

  const onSaveDraft = handleSubmit((data) => {
    const payload = {
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
      channels: data.channels,
      recipientFilter: data.recipientFilter,
    };

    if (isEdit) {
      onUpdate(newsletter._id, payload);
    } else {
      onCreate(payload);
    }
  });

  const onScheduleSubmit = handleSubmit((data) => {
    if (!data.scheduledAt) return;

    if (isEdit) {
      // Save first, then schedule
      const payload = {
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        channels: data.channels,
        recipientFilter: data.recipientFilter,
      };
      onUpdate(newsletter._id, payload);
      // Schedule after a short delay to ensure the update completes
      setTimeout(() => {
        onSchedule(newsletter._id, new Date(data.scheduledAt).toISOString());
      }, 500);
    } else {
      // Create draft first, then schedule via parent callback
      const payload = {
        subject: data.subject,
        bodyHtml: data.bodyHtml,
        bodyText: data.bodyText,
        channels: data.channels,
        recipientFilter: data.recipientFilter,
      };
      onCreate(payload);
    }
  });

  const onSendNow = handleSubmit(() => {
    if (isEdit) {
      onSend(newsletter._id);
    }
  });

  const isPending = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('crm.editNewsletter', 'Edit Newsletter')
              : t('crm.composeNewsletter', 'Compose Newsletter')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'crm.composeNewsletterDescription',
              'Only customers who have opted in to newsletters will receive this email (nDSG compliant).',
            )}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6 mt-2" onSubmit={(e) => e.preventDefault()}>
          {/* nDSG compliance badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs text-green-700 dark:text-green-300">
              {t(
                'crm.ndsgCompliance',
                'nDSG compliant: only opted-in customers with valid email addresses will be targeted.',
              )}
            </span>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">{t('crm.subject', 'Subject')} *</Label>
            <Input
              id="subject"
              {...register('subject', {
                required: t('crm.subjectRequired', 'Subject is required'),
                maxLength: { value: 255, message: t('crm.subjectTooLong', 'Max 255 characters') },
              })}
              placeholder={t('crm.subjectPlaceholder', 'Enter newsletter subject...')}
              disabled={isReadOnly}
              className={cn(errors.subject && 'border-destructive')}
            />
            {errors.subject && (
              <p className="text-xs text-destructive">{errors.subject.message}</p>
            )}
          </div>

          {/* Body HTML */}
          <div className="space-y-2">
            <Label>{t('crm.body', 'Body')} *</Label>
            <Controller
              name="bodyHtml"
              control={control}
              rules={{ required: t('crm.bodyRequired', 'Newsletter body is required') }}
              render={({ field }) => (
                <RichTextEditor
                  content={field.value}
                  onChange={field.onChange}
                  placeholder={t('crm.bodyPlaceholder', 'Write your newsletter content...')}
                  readOnly={isReadOnly}
                  className="min-h-[200px]"
                />
              )}
            />
            {errors.bodyHtml && (
              <p className="text-xs text-destructive">{errors.bodyHtml.message}</p>
            )}
          </div>

          <Separator />

          {/* Recipient preview */}
          <div className="space-y-2">
            <Label>{t('crm.recipientPreview', 'Recipient Preview')}</Label>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50 border border-border">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                {countingRecipients ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('crm.countingRecipients', 'Counting recipients...')}
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold">{recipientCount}</strong>{' '}
                    {t('crm.optedInCustomers', 'opted-in customers will receive this newsletter')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Schedule date */}
          <div className="space-y-2">
            <Label htmlFor="scheduledAt">
              {t('crm.scheduleDate', 'Schedule Date')}
              <span className="text-muted-foreground text-xs ml-1.5">
                ({t('crm.optional', 'optional')})
              </span>
            </Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              {...register('scheduledAt')}
              disabled={isReadOnly}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'crm.scheduleDateHint',
                'Leave empty to send immediately, or pick a future date to schedule.',
              )}
            </p>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>

            {!isReadOnly && (
              <>
                {/* Save Draft */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onSaveDraft}
                  disabled={isPending || (!isDirty && isEdit)}
                  className="gap-1.5"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <Save className="h-3.5 w-3.5" />
                  {t('crm.saveDraft', 'Save Draft')}
                </Button>

                {/* Schedule */}
                {scheduledAt && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onScheduleSubmit}
                    disabled={isPending || !scheduledAt}
                    className="gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {t('crm.schedule', 'Schedule')}
                  </Button>
                )}

                {/* Send Now */}
                {isEdit && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSendNow}
                    disabled={isPending || recipientCount === 0}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t('crm.sendNow', 'Send Now')}
                  </Button>
                )}
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
