'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { useUpdateRepositoryDocument } from '../hooks/use-document-repository';
import { DOCUMENT_CATEGORY_OPTIONS, DOCUMENT_TYPE_OPTIONS } from '../utils/document-formatters';
import { documentLinks, humanizeCode } from '../utils/document-visuals';
import { DocumentLinkPicker, LINKABLE_TYPES } from './document-link-picker';
import { FileKindIcon } from './document-repository-table';

const ID_FIELD = { customer: 'customerId', project: 'projectId', job: 'jobId', employee: 'employeeId', installation: 'installationId' };

/** Title, type, category, description and links of an uploaded document. */
export function DocumentEditDialog({ doc, onOpenChange }) {
  const { t } = useLanguage();
  const update = useUpdateRepositoryDocument();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!doc) return;
    const links = Object.fromEntries(documentLinks(doc).filter((l) => ID_FIELD[l.type]).map((l) => [l.type, { id: l.id, label: l.label || l.id }]));
    setForm({ title: doc.title || '', documentType: doc.documentType || 'OTHER', category: doc.category || 'OTHER', description: doc.description || '', links });
  }, [doc]);

  if (!doc || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const options = (base, current) => (base.some((o) => o.value === current) ? base : [...base, { value: current, label: humanizeCode(current) }]);

  const save = async (e) => {
    e.preventDefault();
    const changes = { title: form.title.trim(), documentType: form.documentType, category: form.category, description: form.description };
    for (const type of LINKABLE_TYPES) changes[ID_FIELD[type]] = form.links[type]?.id || null;
    try {
      await update.mutateAsync({ id: doc.id, changes });
      showSuccess(t('documents.hub.edit.saved', 'Document updated'));
      onOpenChange(false);
    } catch (err) {
      showError(err);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <FileKindIcon doc={doc} />
            <div className="min-w-0">
              <DialogTitle className="truncate">{t('documents.hub.edit', 'Edit details')}</DialogTitle>
              <DialogDescription className="truncate">{doc.fileName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">{t('documents.repository.title')}</Label>
            <Input id="edit-title" value={form.title} onChange={(e) => set('title', e.target.value)} className="h-10 rounded-xl" maxLength={300} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('documents.repository.documentType')}</Label>
              <Select value={form.documentType} onValueChange={(v) => set('documentType', v)}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{options(DOCUMENT_TYPE_OPTIONS, form.documentType).map((o) => <SelectItem key={o.value} value={o.value}>{o.labelKey ? t(o.labelKey) : o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('documents.repository.category')}</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{options(DOCUMENT_CATEGORY_OPTIONS, form.category).map((o) => <SelectItem key={o.value} value={o.value}>{o.labelKey ? t(o.labelKey) : o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:grid-cols-2">
            {LINKABLE_TYPES.map((type) => (
              <div key={type} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t(`documents.repository.link.${type}`, type)}</Label>
                <DocumentLinkPicker type={type} value={form.links[type] || null} onChange={(v) => set('links', { ...form.links, [type]: v })} />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">{t('documents.repository.descriptionField')}</Label>
            <Textarea id="edit-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} className="rounded-xl" maxLength={2000} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" className="gap-2 rounded-full" disabled={update.isPending}>
              {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
