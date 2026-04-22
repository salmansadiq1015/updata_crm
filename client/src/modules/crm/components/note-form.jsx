'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createNoteSchema } from '@/modules/crm/validations/note';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText } from 'lucide-react';
import { NOTE_CATEGORY_META } from '@/modules/crm/constants/crm-constants';
import { cn } from '@/lib/utils';

const BLANK = { text: '', category: 'general', isPinned: false, isWarning: false };

export function NoteForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
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
            <FileText className="h-4 w-4 text-primary" />
            {isEdit ? t('crm.notes.editNote', 'Notiz bearbeiten') : t('crm.notes.newNote', 'Neue Notiz')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('crm.notes.text', 'Text')}*</Label>
            <Textarea rows={4} {...register('text')} autoFocus placeholder={t('crm.notes.textPlaceholder', 'Notiz...')} />
            {errors.text && <p className="text-xs text-destructive">{errors.text.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('crm.notes.category', 'Kategorie')}</Label>
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
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div>
              <Label className="text-sm font-medium">{t('crm.notes.pinned', 'Angeheftet')}</Label>
              <p className="text-xs text-muted-foreground">{t('crm.notes.pinnedHint', 'Oben in der Liste anzeigen')}</p>
            </div>
            <Switch checked={isPinned} onCheckedChange={(v) => setValue('isPinned', v, { shouldDirty: true })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div>
              <Label className="text-sm font-medium">{t('crm.notes.warning', 'Warnung')}</Label>
              <p className="text-xs text-muted-foreground">{t('crm.notes.warningHint', 'Als Warnhinweis kennzeichnen')}</p>
            </div>
            <Switch checked={isWarning} onCheckedChange={(v) => setValue('isWarning', v, { shouldDirty: true })} />
          </div>

          <DialogFooter className="gap-2">
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
