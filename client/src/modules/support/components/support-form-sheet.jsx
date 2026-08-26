'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { X, Loader2, LifeBuoy, XCircle, Send, ImageIcon } from 'lucide-react';
import {
  ticketFormSchema,
  TICKET_TYPES,
  TYPE_CONFIG,
  PRIORITY_LEVELS,
  PRIORITY_CONFIG,
} from '../constants';

const TYPE_LABELS = { feedback: 'Feedback', bug: 'Bug', feature_request: 'Feature', other: 'Sonstiges' };
const PRIORITY_LABELS = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' };

export default function SupportFormSheet({ open, onOpenChange, isSubmitting, onSubmit, initialFile, origin }) {
  const { t } = useLanguage();
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: { type: 'bug', priority: 'normal', subject: '', description: '' },
  });

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const inputRef = useRef(null);
  const watchedDescription = watch('description');

  useEffect(() => {
    if (open) {
      reset({ type: 'bug', priority: 'normal', subject: '', description: '' });
      if (initialFile) {
        setFile(initialFile);
        setPreview(URL.createObjectURL(initialFile));
      } else {
        setFile(null);
        setPreview('');
      }
    }
  }, [open, reset, initialFile]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const removeFile = () => {
    setFile(null);
    setPreview('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFormSubmit = (data) => {
    onSubmit({
      ...data,
      file,
      // Pass origin fields captured by the FAB at click time
      ...(origin || {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col" showCloseButton={false}>
        <SheetTitle className="sr-only">{t('support.form.title', 'Problem melden')}</SheetTitle>
        <SheetDescription className="sr-only">{t('support.form.desc', 'Beschreiben Sie das Problem')}</SheetDescription>

        {/* Gradient Header */}
        <div className="relative overflow-hidden px-6 pt-5 pb-4 border-b bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-transparent border-primary/10 dark:from-primary/15 dark:via-primary/10 dark:to-transparent dark:border-primary/20 shrink-0">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full blur-2xl bg-primary/10 dark:bg-primary/15" />
          </div>
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/10 border border-primary/20 shadow-sm">
                <LifeBuoy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{t('support.form.title', 'Problem melden')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t('support.form.desc', 'Beschreiben Sie das Problem')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background/90 hover:bg-muted transition-colors shadow-sm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('support.form.type', 'Typ')} <span className="text-destructive">*</span></Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={cn('h-9 text-xs rounded-lg', errors.type && 'border-destructive')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_TYPES.map((tt) => (
                        <SelectItem key={tt} value={tt}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', TYPE_CONFIG[tt]?.dot)} />
                            {TYPE_LABELS[tt] || tt}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('support.form.priority', 'Prioritaet')}</Label>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_LEVELS.map((p) => (
                        <SelectItem key={p} value={p}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_CONFIG[p]?.dot)} />
                            {PRIORITY_LABELS[p] || p}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

          {/* Subject */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('support.form.subject', 'Betreff')} <span className="text-destructive">*</span></Label>
              <span className="text-[10px] text-muted-foreground">{(watch('subject') || '').length}/200</span>
            </div>
            <Input
              className={cn('h-9 text-sm rounded-lg border-border/60', errors.subject && 'border-destructive')}
              placeholder={t('support.form.subjectPlaceholder', 'Kurze Zusammenfassung des Problems')}
              maxLength={200}
              {...register('subject')}
            />
            {errors.subject && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3" />{t('support.form.subjectRequired', 'Betreff ist erforderlich')}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('support.form.description', 'Beschreibung')} <span className="text-destructive">*</span></Label>
              <span className="text-[10px] text-muted-foreground">{(watchedDescription || '').length}/5000</span>
            </div>
            <Textarea
              className={cn('min-h-[120px] text-sm rounded-lg border-border/60', errors.description && 'border-destructive')}
              placeholder={t('support.form.descriptionPlaceholder', 'Was ist passiert? Was haben Sie erwartet?')}
              maxLength={5000}
              {...register('description')}
            />
            {errors.description && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3" />{t('support.form.descriptionRequired', 'Beschreibung ist erforderlich')}
              </p>
            )}
          </div>

          {/* Attachment */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t('support.form.attachment', 'Anhang')} <span className="text-[10px] text-muted-foreground font-normal">({t('common.optional', 'Optional')})</span>
            </Label>
            {preview ? (
              <div className="relative w-32">
                <img src={preview} alt="Preview" className="w-32 h-24 object-cover rounded-lg border border-border/60" />
                <button
                  type="button"
                  onClick={removeFile}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border/50 bg-muted/30 px-4 py-4 flex flex-col items-center justify-center gap-1.5 text-center hover:bg-muted/50 transition-colors"
              >
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('support.form.attachmentHint', 'Bild hinzufuegen')}</span>
              </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border/40">
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg px-4" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" size="sm" className="h-9 gap-2 rounded-full px-5 shadow-lg shadow-primary/20" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('support.form.submitting', 'Wird gesendet...')}</>
              ) : (
                <><Send className="h-3.5 w-3.5" />{t('support.form.submit', 'Absenden')}</>
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
