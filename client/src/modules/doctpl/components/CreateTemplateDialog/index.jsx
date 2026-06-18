'use client';

import { useMemo, useState } from 'react';
import { FileText, Plus, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  BUILT_IN_TEMPLATE_TYPES,
  TEMPLATE_TYPE_PATTERN,
  buildTemplateCreatePayload,
  normalizeTemplateType,
} from '../../utils/template-defaults';

const DEFAULT_PRESET_TYPE = 'cover_letter';
const DEFAULT_CUSTOM_TYPE = 'custom_document';

function modeButtonClass(active) {
  return active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground';
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState('preset');
  const [presetType, setPresetType] = useState(DEFAULT_PRESET_TYPE);
  const [customType, setCustomType] = useState(DEFAULT_CUSTOM_TYPE);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const resolvedType = useMemo(
    () => (mode === 'custom' ? normalizeTemplateType(customType) : presetType),
    [customType, mode, presetType],
  );
  const typeIsValid = TEMPLATE_TYPE_PATTERN.test(resolvedType);
  const nameIsValid = Boolean(name.trim());
  const canSubmit = typeIsValid && nameIsValid && !isSubmitting;

  const payload = useMemo(() => buildTemplateCreatePayload({
    name,
    description,
    templateType: resolvedType,
  }), [description, name, resolvedType]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit?.(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t('doctpl.templates.createTitle', 'Create template')}
          </DialogTitle>
          <DialogDescription>
            {t('doctpl.templates.createDescription', 'Start from a built-in document profile or define a custom template type.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${modeButtonClass(mode === 'preset')}`}
                onClick={() => setMode('preset')}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Wand2 className="h-4 w-4" />
                  {t('doctpl.templates.modePreset', 'Built-in type')}
                </span>
              </button>
              <button
                type="button"
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${modeButtonClass(mode === 'custom')}`}
                onClick={() => setMode('custom')}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Plus className="h-4 w-4" />
                  {t('doctpl.templates.modeCustom', 'Custom type')}
                </span>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">{t('doctpl.templates.name', 'Name')}</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('doctpl.templates.namePlaceholder', 'e.g. Service Notice')}
                  aria-invalid={!nameIsValid && name.length > 0}
                />
              </div>

              {mode === 'preset' ? (
                <div className="space-y-2">
                  <Label>{t('doctpl.templates.baseType', 'Base type')}</Label>
                  <Select value={presetType} onValueChange={setPresetType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILT_IN_TEMPLATE_TYPES.map(([value, key]) => (
                        <SelectItem key={value} value={value}>{t(key, value)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="template-custom-type">{t('doctpl.templates.customType', 'Custom type')}</Label>
                  <Input
                    id="template-custom-type"
                    value={customType}
                    onChange={(event) => setCustomType(event.target.value)}
                    placeholder={t('doctpl.templates.customTypePlaceholder', 'custom_service_notice')}
                    aria-invalid={!typeIsValid}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description">{t('doctpl.templates.descriptionField', 'Description')}</Label>
              <Textarea
                id="template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('doctpl.templates.descriptionPlaceholder', 'Optional internal note for this template')}
              />
            </div>

            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('doctpl.templates.typeSlug', 'Type slug')}:</span> {resolvedType || '-'}
              {!typeIsValid && (
                <span className="ml-2 text-destructive">{t('doctpl.templates.slugInvalid', 'Use a lowercase slug starting with a letter.')}</span>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)} disabled={isSubmitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" className="gap-2" disabled={!canSubmit}>
              <Plus className="h-4 w-4" />
              {isSubmitting ? t('common.saving', 'Saving...') : t('doctpl.templates.create', 'Create template')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
