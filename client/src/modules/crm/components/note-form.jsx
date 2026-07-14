'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createNoteSchema } from '@/modules/crm/validations/note';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, StickyNote, AlertCircle } from 'lucide-react';
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
      <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-500/10 ring-1 ring-slate-500/20 shrink-0">
              <StickyNote className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit ? t('crm.notes.editNote', 'Notiz bearbeiten') : t('crm.notes.newNote', 'Neue Notiz')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {isEdit
                  ? t('crm.notes.editDesc', 'Notizinhalt und Einstellungen anpassen.')
                  : t('crm.notes.createDesc', 'Neue Notiz zu diesem Datensatz hinzufügen.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            <DarkField label={t('crm.notes.text', 'Text')} required error={errors.text}>
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
            </DarkField>

            <DarkField label={t('crm.notes.category', 'Kategorie')} error={errors.category}>
              <Select value={category} onValueChange={(v) => setValue('category', v, { shouldDirty: true })}>
                <SelectTrigger className="bg-background border-border rounded-lg h-9 text-[13px] text-foreground focus:border-slate-500/50 focus:ring-slate-500/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Object.entries(NOTE_CATEGORY_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key} className="text-foreground focus:bg-muted/50 focus:text-foreground">
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.notes.category.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </DarkField>

            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.notes.sectionFlags', 'Markierungen')}
            </p>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium text-foreground">{t('crm.notes.pinned', 'Angeheftet')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('crm.notes.pinnedHint', 'Oben in der Liste anzeigen')}</p>
              </div>
              <Switch checked={isPinned} onCheckedChange={(v) => setValue('isPinned', v, { shouldDirty: true })} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium text-foreground">{t('crm.notes.warning', 'Warnung')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('crm.notes.warningHint', 'Als Warnhinweis kennzeichnen')}</p>
              </div>
              <Switch checked={isWarning} onCheckedChange={(v) => setValue('isWarning', v, { shouldDirty: true })} />
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.notes.createNote', 'Notiz erstellen')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DarkField({ label, required, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error.message}
        </p>
      )}
    </div>
  );
}
