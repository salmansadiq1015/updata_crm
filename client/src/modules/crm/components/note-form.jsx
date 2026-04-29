'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createNoteSchema } from '@/modules/crm/validations/note';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Loader2, FileText } from 'lucide-react';
import { NOTE_CATEGORY_META } from '@/modules/crm/constants/crm-constants';
import { cn } from '@/lib/utils';

const BLANK = { text: '', category: 'general', isPinned: false, isWarning: false };

export function NoteForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm({
    resolver: zodResolver(createNoteSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        text: defaultValues.text || '',
        category: defaultValues.category || 'general',
        isPinned: !!defaultValues.isPinned,
        isWarning: !!defaultValues.isWarning,
      });
    } else reset(BLANK);
  }, [defaultValues, reset, open]);

  const category = watch('category');
  const isPinned = watch('isPinned');
  const isWarning = watch('isWarning');

  const submit = async (data) => {
    try {
      await onSubmit(data);
      onOpenChange(false);
    } catch {
      // keep modal open on failure
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-primary" />
            {isEdit ? t('crm.notes.editNote', 'Notiz bearbeiten') : t('crm.notes.newNote', 'Neue Notiz')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <FormBody>
            <FormField label={t('crm.notes.text', 'Text')} required error={errors.text?.message}>
              <Controller
                name="text"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t('crm.notes.textPlaceholder', 'Notiz...')}
                    maxLength={5000}
                    minHeight={120}
                    error={errors.text}
                  />
                )}
              />
            </FormField>

            <FormField label={t('crm.notes.category', 'Kategorie')} error={errors.category?.message}>
              <Select value={category} onValueChange={(v) => setValue('category', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTE_CATEGORY_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.notes.category.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </FormField>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium">{t('crm.notes.pinned', 'Angeheftet')}</Label>
                <p className="text-xs text-muted-foreground/70">{t('crm.notes.pinnedHint', 'Oben in der Liste anzeigen')}</p>
              </div>
              <Switch checked={isPinned} onCheckedChange={(v) => setValue('isPinned', v, { shouldDirty: true })} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium">{t('crm.notes.warning', 'Warnung')}</Label>
                <p className="text-xs text-muted-foreground/70">{t('crm.notes.warningHint', 'Als Warnhinweis kennzeichnen')}</p>
              </div>
              <Switch checked={isWarning} onCheckedChange={(v) => setValue('isWarning', v, { shouldDirty: true })} />
            </div>
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.notes.createNote', 'Notiz erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
