'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { emailService } from '@/modules/doctpl/services/EmailService';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';

const LANGUAGES = ['de', 'fr', 'it', 'en'];

// Kept in step with the resolver in emailTemplate.service.render().
const VARIABLES = [
  'customerName', 'customerEmail',
  'siteName', 'siteAddress',
  'projectName', 'projectNumber',
  'senderName', 'senderEmail',
];

const blank = () => ({
  templateType: '', language: 'de', subjectTemplate: '', bodyHtml: '', isActive: true,
});

/**
 * Manage the reusable email texts offered in the compose modal. A template is
 * one text in one language; the same templateType across languages forms the
 * set the modal picks from according to the user's language.
 */
export function EmailTemplatesAdmin() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('templates:write');
  const canDelete = hasPermission('templates:delete');

  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['doctpl', 'email-templates'],
    queryFn: async () => (await emailService.listTemplates())?.data ?? [],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['doctpl', 'email-templates'] });

  const remove = useMutation({
    mutationFn: (id) => emailService.deleteTemplate(id),
    onSuccess: () => { invalidate(); showSuccess(t('doctpl.email.templateDeleted', 'Vorlage gelöscht')); setDeleteTarget(null); },
    onError: (err) => showError(err),
  });
  const duplicate = useMutation({
    mutationFn: (id) => emailService.duplicateTemplate(id),
    onSuccess: () => { invalidate(); showSuccess(t('doctpl.email.templateDuplicated', 'Vorlage dupliziert')); },
    onError: (err) => showError(err),
  });

  // One row per templateType, its languages side by side.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const tpl of templates) {
      if (!map.has(tpl.templateType)) map.set(tpl.templateType, []);
      map.get(tpl.templateType).push(tpl);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t('doctpl.email.templatesTitle', 'E-Mail-Vorlagen')}</h2>
          <span className="text-xs text-muted-foreground">({templates.length})</span>
        </div>
        {canWrite && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setEditing(blank())}>
            <Plus className="h-3.5 w-3.5" /> {t('doctpl.email.newTemplate', 'Neue Vorlage')}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('doctpl.email.templatesHint', 'Vorlagen erscheinen beim E-Mail-Versand in der Sprache des Benutzers. Platzhalter werden automatisch ersetzt.')}
      </p>

      {templates.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={t('doctpl.email.templatesEmpty', 'Keine E-Mail-Vorlagen')}
          description={t('doctpl.email.templatesEmptyDesc', 'Erfassen Sie wiederkehrende Texte wie Terminanfragen oder Offert-Nachfassungen.')}
        />
      ) : (
        <div className="space-y-2">
          {grouped.map(([type, items]) => (
            <div key={type} className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-[13px] font-semibold text-foreground">{type}</p>
              <ul className="mt-2 divide-y divide-border/60">
                {items.map((tpl) => (
                  <li key={tpl._id} className="flex items-center gap-3 py-2">
                    <span className="w-8 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                      {tpl.language}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{tpl.subjectTemplate}</span>
                    {tpl.isActive === false && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t('common.inactive', 'Inaktiv')}
                      </span>
                    )}
                    {canWrite && (
                      <>
                        <IconActionButton label={t('common.edit', 'Bearbeiten')} icon={Pencil} onClick={() => setEditing(tpl)} />
                        <IconActionButton label={t('common.duplicate', 'Duplizieren')} icon={Copy} onClick={() => duplicate.mutate(tpl._id)} />
                      </>
                    )}
                    {canDelete && (
                      <IconActionButton label={t('common.delete', 'Löschen')} icon={Trash2} destructive onClick={() => setDeleteTarget(tpl)} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { invalidate(); setEditing(null); }}
          t={t}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('doctpl.email.deleteTemplateTitle', 'Vorlage löschen')}
        description={t('doctpl.email.deleteTemplateDesc', 'Die Vorlage steht beim E-Mail-Versand nicht mehr zur Verfügung.')}
        confirmText={t('common.delete', 'Löschen')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function TemplateDialog({ template, onClose, onSaved, t }) {
  const isEdit = !!template._id;
  const [form, setForm] = useState(() => ({
    templateType: template.templateType || '',
    language: template.language || 'de',
    subjectTemplate: template.subjectTemplate || '',
    bodyHtml: template.bodyHtml || '',
    isActive: template.isActive !== false,
  }));

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      // templateType and language identify the template and stay fixed once set.
      const payload = isEdit
        ? { subjectTemplate: form.subjectTemplate, bodyHtml: form.bodyHtml, isActive: form.isActive }
        : { ...form, templateType: form.templateType.trim() };
      return isEdit
        ? emailService.updateTemplate(template._id, payload)
        : emailService.createTemplate(payload);
    },
    onSuccess: () => { showSuccess(t('doctpl.email.templateSaved', 'Vorlage gespeichert')); onSaved(); },
    onError: (err) => showError(err),
  });

  const valid = form.templateType.trim() && form.subjectTemplate.trim() && form.bodyHtml.trim();

  return (
    <Dialog open onOpenChange={(v) => !v && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('doctpl.email.editTemplate', 'Vorlage bearbeiten') : t('doctpl.email.newTemplate', 'Neue Vorlage')}
          </DialogTitle>
          <DialogDescription>
            {t('doctpl.email.templateDialogDesc', 'Betreff und Text einer wiederkehrenden E-Mail, pro Sprache.')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('doctpl.email.templateType', 'Bezeichnung')}*</Label>
              <Input
                value={form.templateType}
                onChange={(e) => set('templateType')(e.target.value)}
                placeholder="terminanfrage"
                disabled={isEdit || save.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('doctpl.email.templateLanguage', 'Sprache')}*</Label>
              <Select value={form.language} onValueChange={set('language')} disabled={isEdit || save.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => <SelectItem key={lang} value={lang}>{lang.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('doctpl.subject', 'Betreff')}*</Label>
            <Input value={form.subjectTemplate} onChange={(e) => set('subjectTemplate')(e.target.value)} disabled={save.isPending} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('doctpl.message', 'Nachricht')}*</Label>
            <Textarea rows={10} value={form.bodyHtml} onChange={(e) => set('bodyHtml')(e.target.value)} disabled={save.isPending} />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('doctpl.email.variables', 'Platzhalter')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => set('bodyHtml')(`${form.bodyHtml}{{${name}}}`)}
                  className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive')(e.target.checked)}
              disabled={save.isPending}
              className={cn('h-4 w-4 rounded border-border')}
            />
            {t('doctpl.email.templateActive', 'Aktiv — beim Versand vorschlagen')}
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save', 'Speichern')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
