'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';
import { documentService } from '@/modules/pm/services/document-service';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormBody } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import {
  FileText, CalendarCheck, ClipboardList, BadgeCheck, Loader2, ArrowLeft, Save, Sparkles, Eye,
} from 'lucide-react';

// Friendly labels for the 3 PM template types (PROJ-005 AC-1).
export const PM_TEMPLATE_TYPES = [
  {
    value: 'project_appointment_confirmation',
    label: 'Terminbestätigung',
    labelEn: 'Appointment Confirmation',
    icon: CalendarCheck,
  },
  {
    value: 'project_status_report',
    label: 'Statusbericht',
    labelEn: 'Status Report',
    icon: ClipboardList,
  },
  {
    value: 'project_completion_certificate',
    label: 'Abschlusszertifikat',
    labelEn: 'Completion Certificate',
    icon: BadgeCheck,
  },
];

export function templateLabel(value, language) {
  const t = PM_TEMPLATE_TYPES.find((x) => x.value === value);
  if (!t) return value;
  return language === 'de' ? t.label : t.labelEn;
}

// Overridable fields shown in the edit step (AC-4). Mirrors the server overridesSchema.
const OVERRIDE_FIELDS = [
  { key: 'recipientName', type: 'input', label: 'Empfänger', labelEn: 'Recipient name' },
  { key: 'documentDate', type: 'input', label: 'Dokumentdatum', labelEn: 'Document date' },
  { key: 'projectManager', type: 'input', label: 'Projektleiter', labelEn: 'Project manager' },
  { key: 'intro', type: 'textarea', label: 'Einleitung', labelEn: 'Intro' },
  { key: 'description', type: 'textarea', label: 'Beschreibung', labelEn: 'Description' },
  { key: 'notes', type: 'textarea', label: 'Notizen', labelEn: 'Notes' },
];

/**
 * Create-Document flow: template picker → pre-filled edit/preview → generate.
 * Also supports "Save as draft" (AF-2) and reopening an existing draft to finalize.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onOpenChange
 * @param {string} props.projectId
 * @param {object} [props.draft] - existing DRAFT document being resumed (optional)
 */
export function DocumentGenerateDialog({ open, onOpenChange, projectId, draft = null }) {
  const { t, language } = useLanguage();
  const [step, setStep] = useState('pick'); // 'pick' | 'edit'
  const [templateType, setTemplateType] = useState(null);
  const [overrides, setOverrides] = useState({});

  const close = () => onOpenChange(false);

  const { generate, saveDraft } = useDocumentMutations(projectId, {
    onGenerate: close,
    onDraft: close,
  });

  // Initialise from a resumed draft, or reset on open.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (draft) {
      setTemplateType(draft.templateType || null);
      setOverrides(draft.overrides || {});
      setStep(draft.templateType ? 'edit' : 'pick');
    } else {
      setTemplateType(null);
      setOverrides({});
      setStep('pick');
    }
  }, [open, draft]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setField = (key, value) => setOverrides((prev) => ({ ...prev, [key]: value }));

  // Live merged-document preview (PROJ-005 AC-4). Debounced so typing in the
  // override fields doesn't spam the server; only runs on the edit step.
  const debouncedOverrides = useDebounce(overrides, 400);
  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['pm', 'documents', 'preview', projectId, templateType, debouncedOverrides],
    queryFn: () => documentService.previewDocument(projectId, { templateType, overrides: debouncedOverrides }),
    enabled: open && step === 'edit' && !!templateType,
    staleTime: 10_000,
  });
  const previewBody = preview?.introduction || '';

  const pickTemplate = (value) => {
    setTemplateType(value);
    setStep('edit');
  };

  const handleGenerate = () => {
    generate.mutate({ templateType, overrides, draftId: draft?._id || null });
  };

  const handleSaveDraft = () => {
    saveDraft.mutate({ templateType, overrides, draftId: draft?._id || null });
  };

  const busy = generate.isPending || saveDraft.isPending;

  const heading = useMemo(() => {
    if (step === 'pick') return language === 'de' ? 'Vorlage wählen' : 'Choose a template';
    return templateLabel(templateType, language);
  }, [step, templateType, language]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {language === 'de' ? 'Dokument erstellen' : 'Create Document'}
          </DialogTitle>
          <DialogDescription>{heading}</DialogDescription>
        </DialogHeader>

        {step === 'pick' ? (
          <div className="grid gap-2.5 py-1">
            {PM_TEMPLATE_TYPES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.value}
                  type="button"
                  onClick={() => pickTemplate(tpl.value)}
                  className={cn(
                    'group flex items-center gap-3.5 rounded-xl border border-border/60 bg-card p-3.5 text-left transition-all duration-200',
                    'hover:border-primary/40 hover:bg-primary/[0.03] hover:shadow-sm',
                  )}
                >
                  <div className="h-10 w-10 rounded-xl bg-primary/8 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">
                      {language === 'de' ? tpl.label : tpl.labelEn}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {language === 'de' ? 'PDF generieren' : 'Generate PDF'}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground/40 ml-auto group-hover:text-primary/60 transition-colors" />
                </button>
              );
            })}
          </div>
        ) : (
          <FormBody>
            <p className="text-xs text-muted-foreground -mt-1">
              {language === 'de'
                ? 'Felder leer lassen, um die Projektdaten zu verwenden. Eingetragene Werte überschreiben die Vorlage.'
                : 'Leave fields empty to use project data. Entered values override the template.'}
            </p>
            {OVERRIDE_FIELDS.map((f) => (
              <FormField key={f.key} label={language === 'de' ? f.label : f.labelEn}>
                {f.type === 'textarea' ? (
                  <Textarea
                    value={overrides[f.key] || ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={language === 'de' ? 'Optional…' : 'Optional…'}
                    rows={3}
                  />
                ) : (
                  <Input
                    value={overrides[f.key] || ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={language === 'de' ? 'Optional…' : 'Optional…'}
                  />
                )}
              </FormField>
            ))}

            {/* Live preview of the composed document body (PROJ-005 AC-4) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                {language === 'de' ? 'Vorschau' : 'Preview'}
                {previewLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 max-h-56 overflow-y-auto">
                {previewBody ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">
                    {previewBody}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground/70">
                    {language === 'de'
                      ? 'Die Vorschau wird hier angezeigt.'
                      : 'The composed document preview appears here.'}
                  </p>
                )}
              </div>
            </div>
          </FormBody>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 'edit' && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto gap-1.5"
              disabled={busy || !!draft?.templateType}
              onClick={() => setStep('pick')}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {language === 'de' ? 'Zurück' : 'Back'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {step === 'edit' && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={handleSaveDraft}
                disabled={busy}
              >
                {saveDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {language === 'de' ? 'Als Entwurf speichern' : 'Save as draft'}
              </Button>
              <Button type="button" className="gap-2" onClick={handleGenerate} disabled={busy}>
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {language === 'de' ? 'Generieren' : 'Generate'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
