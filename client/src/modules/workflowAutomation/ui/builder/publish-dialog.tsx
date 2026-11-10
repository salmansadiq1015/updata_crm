'use client';
import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import type { ValidationResult } from '../../types/workflow-types';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  validation: ValidationResult | null;
  nextVersion: number;
  publishing: boolean;
  dirty: boolean;
  onPublish: (notes: string) => void;
  nodeLabel: (id?: string | null) => string;
}

export function PublishDialog({ open, onOpenChange, validation, nextVersion, publishing, dirty, onPublish, nodeLabel }: Props) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState('');
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Rocket className="size-5 text-primary" />{t('workflowBuilder.publish.title', 'Publish version {version}', { version: nextVersion })}</DialogTitle>
          <DialogDescription>{t('workflowBuilder.publish.description', 'New enrollments use this version. Running executions keep the version they started with.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!validation ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t('workflowBuilder.panel.validating', 'Checking…')}</p>
            : errors.length ? (
              <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><AlertCircle className="size-4" />{t('workflowBuilder.publish.blocked', '{count} problem(s) must be fixed first', { count: errors.length })}</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-rose-800 dark:text-rose-200">
                  {errors.slice(0, 20).map((e, i) => <li key={i}>• {e.nodeId ? <strong>{nodeLabel(e.nodeId)}: </strong> : null}{t(`workflowBuilder.validation.${e.code}`, e.code)}</li>)}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />{t('workflowBuilder.publish.valid', 'All checks passed')}</p>
            )}
          {warnings.length > 0 && (
            <div className="space-y-1 rounded-xl bg-amber-500/8 p-3 text-xs text-amber-900 dark:text-amber-100">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-3.5" />{t('workflowBuilder.publish.warnings', 'Worth a look')}</p>
              {warnings.slice(0, 8).map((w, i) => <p key={i}>• {w.nodeId ? <strong>{nodeLabel(w.nodeId)}: </strong> : null}{t(`workflowBuilder.validation.${w.code}`, w.code)}</p>)}
            </div>
          )}
          {dirty && <p className="text-xs text-muted-foreground">{t('workflowBuilder.publish.savesFirst', 'Your unsaved changes are saved before publishing.')}</p>}
          <div className="space-y-1.5">
            <label htmlFor="wf-publish-notes" className="text-xs font-semibold">{t('workflowBuilder.publish.notes', 'Release notes (optional)')}</label>
            <Textarea id="wf-publish-notes" value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} maxLength={500} rows={3} className="" placeholder={t('workflowBuilder.publish.notesPlaceholder', 'What changed in this version?')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('workflowBuilder.common.cancel', 'Cancel')}</Button>
          <Button disabled={!validation || errors.length > 0 || publishing} onClick={() => onPublish(notes)}>
            {publishing ? <Loader2 className="me-1.5 size-4 animate-spin" /> : <Rocket className="me-1.5 size-4" />}{t('workflowBuilder.publish.confirm', 'Publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
