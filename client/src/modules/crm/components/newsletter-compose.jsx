'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n/language-context';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { newsletterService } from '@/modules/crm/services/newsletter-service';
import { queryKeys } from '@/lib/query/keys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CH_CANTONS, CUSTOMER_TYPES } from '@/modules/crm/constants/customer-constants';
import { cn } from '@/lib/utils';
import {
  Loader2, Send, Clock, Save, Users, ShieldCheck, Filter, Info,
} from 'lucide-react';

const ALL_VALUE = '__all__';

/**
 * Build the structured recipientFilter sent to the server.
 * Only includes keys that are actually set — the server always forces
 * opt-in + active + valid email regardless of what we send here, so we
 * never need to pass an opt-in flag.
 */
function buildRecipientFilter({ type, canton, city }) {
  const filter = {};
  if (type && type !== ALL_VALUE) filter.type = type;
  if (canton && canton !== ALL_VALUE) filter.canton = canton;
  const trimmedCity = (city || '').trim();
  if (trimmedCity) filter.city = trimmedCity;
  return filter;
}

const BLANK_VALUES = {
  subject: '',
  bodyHtml: '',
  bodyText: '',
  channels: ['email'],
  filterType: ALL_VALUE,
  filterCanton: ALL_VALUE,
  filterCity: '',
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
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

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

  const filterType = watch('filterType');
  const filterCanton = watch('filterCanton');
  const filterCity = watch('filterCity');
  const scheduledAt = watch('scheduledAt');

  // Structured recipient filter built from the controls — only set keys.
  const recipientFilter = buildRecipientFilter({
    type: filterType,
    canton: filterCanton,
    city: filterCity,
  });

  // Load recipient count preview (driven by the structured filter above)
  const { data: recipientData, isFetching: countingRecipients } = useQuery({
    queryKey: queryKeys.crm.newsletters.recipientCount(recipientFilter),
    queryFn: () => newsletterService.countRecipients(recipientFilter),
    enabled: open,
    staleTime: 30_000,
  });

  const recipientCount = recipientData?.count ?? 0;

  // Reset form when opening or switching newsletter
  useEffect(() => {
    if (open) {
      if (newsletter) {
        const rf = newsletter.recipientFilter || {};
        reset({
          subject: newsletter.subject || '',
          bodyHtml: newsletter.bodyHtml || '',
          bodyText: newsletter.bodyText || '',
          channels: newsletter.channels || ['email'],
          filterType: rf.type || ALL_VALUE,
          filterCanton: rf.canton || ALL_VALUE,
          filterCity: rf.city || '',
          scheduledAt: newsletter.scheduledAt
            ? new Date(newsletter.scheduledAt).toISOString().slice(0, 16)
            : '',
        });
      } else {
        reset(BLANK_VALUES);
      }
    }
  }, [open, newsletter, reset]);

  const buildPayload = (data) => ({
    subject: data.subject,
    bodyHtml: data.bodyHtml,
    bodyText: data.bodyText,
    channels: data.channels,
    recipientFilter: buildRecipientFilter({
      type: data.filterType,
      canton: data.filterCanton,
      city: data.filterCity,
    }),
  });

  const onSaveDraft = handleSubmit((data) => {
    const payload = buildPayload(data);

    if (isEdit) {
      onUpdate(newsletter._id, payload);
    } else {
      onCreate(payload);
    }
  });

  const onScheduleSubmit = handleSubmit((data) => {
    if (!data.scheduledAt) return;

    const payload = buildPayload(data);

    if (isEdit) {
      // Save first, then schedule
      onUpdate(newsletter._id, payload);
      // Schedule after a short delay to ensure the update completes
      setTimeout(() => {
        onSchedule(newsletter._id, new Date(data.scheduledAt).toISOString());
      }, 500);
    } else {
      // Create draft first, then schedule via parent callback
      onCreate(payload);
    }
  });

  const onSendNow = handleSubmit(() => {
    if (isEdit) {
      onSend(newsletter._id);
    }
  });

  const handleImageUpload = useCallback(async (file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('module', 'crm');
    form.append('bucket', 'images');
    form.append('category', 'newsletter');
    const res = await apiClient.post(ENDPOINTS.FILES.UPLOAD, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return { url: res.data.url, fileId: res.data._id };
  }, []);

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
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('crm.bodyPlaceholder', 'Write your newsletter content...')}
                  readOnly={isReadOnly}
                  className="min-h-[200px]"
                  onImageUpload={handleImageUpload}
                />
              )}
            />
            {errors.bodyHtml && (
              <p className="text-xs text-destructive">{errors.bodyHtml.message}</p>
            )}
          </div>

          <Separator />

          {/* Recipient filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="mb-0">{t('crm.recipients', 'Recipients')}</Label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Customer type */}
              <div className="space-y-1.5">
                <Label htmlFor="filterType" className="text-xs text-muted-foreground font-normal">
                  {t('crm.type', 'Type')}
                </Label>
                <Controller
                  name="filterType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger id="filterType" size="sm">
                        <SelectValue placeholder={t('crm.allTypes', 'All types')} />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        <SelectItem value={ALL_VALUE}>{t('crm.allTypes', 'All types')}</SelectItem>
                        <SelectItem value={CUSTOMER_TYPES.PRIVATE}>
                          {t('crm.typePrivate', 'Private')}
                        </SelectItem>
                        <SelectItem value={CUSTOMER_TYPES.BUSINESS}>
                          {t('crm.typeBusiness', 'Business')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Canton */}
              <div className="space-y-1.5">
                <Label htmlFor="filterCanton" className="text-xs text-muted-foreground font-normal">
                  {t('crm.canton', 'Canton')}
                </Label>
                <Controller
                  name="filterCanton"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger id="filterCanton" size="sm">
                        <SelectValue placeholder={t('crm.allCantons', 'All cantons')} />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="max-h-72">
                        <SelectItem value={ALL_VALUE}>{t('crm.allCantons', 'All cantons')}</SelectItem>
                        {CH_CANTONS.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* City */}
              <div className="space-y-1.5">
                <Label htmlFor="filterCity" className="text-xs text-muted-foreground font-normal">
                  {t('crm.city', 'City')}
                </Label>
                <Input
                  id="filterCity"
                  {...register('filterCity')}
                  placeholder={t('crm.cityPlaceholder', 'e.g. Zürich')}
                  disabled={isReadOnly}
                  className="h-8 text-[13px]"
                />
              </div>
            </div>

            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {t(
                  'crm.recipientFilterOptInNote',
                  'Opted-out customers are always excluded, regardless of these filters.',
                )}
              </span>
            </div>
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
                    onClick={() => setConfirmSendOpen(true)}
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

        {/* Send Confirmation */}
        <ConfirmDialog
          open={confirmSendOpen}
          onOpenChange={setConfirmSendOpen}
          title={t('crm.sendNewsletter', 'Send Newsletter')}
          description={t(
            'crm.sendNewsletterConfirm',
            'Are you sure you want to send "{subject}" now? This will email all opted-in recipients immediately.',
            { subject: newsletter?.subject || '' },
          )}
          confirmText={t('crm.sendNow', 'Send Now')}
          variant="default"
          onConfirm={() => {
            setConfirmSendOpen(false);
            onSendNow();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
