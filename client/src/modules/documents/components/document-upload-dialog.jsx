'use client';

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudUpload, Loader2, TriangleAlert, UploadCloud, X, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { documentRepositoryService } from '../services/document-repository-service';
import { DOCUMENT_CATEGORY_OPTIONS, DOCUMENT_TYPE_OPTIONS } from '../utils/document-formatters';
import { fileKindOf, FILE_KIND_META, formatBytes } from '../utils/document-visuals';
import { DocumentLinkPicker, LINKABLE_TYPES } from './document-link-picker';

const MAX_FILES = 20;
const CONCURRENCY = 2;
const initialForm = { title: '', documentType: 'OTHER', category: 'OTHER', folderPath: '', description: '' };
const ID_FIELD = { customer: 'customerId', project: 'projectId', job: 'jobId', employee: 'employeeId', installation: 'installationId' };

/**
 * Upload one or many files with shared details. Links are chosen by name in
 * searchable pickers (the old dialog asked for database ids). Files upload two
 * at a time with a status per file; the list refreshes once at the end.
 */
export function DocumentUploadDialog({ open, onOpenChange, defaultLinks = null }) {
  const { t, locale } = useLanguage();
  const intl = intlLocaleFor(locale);
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [links, setLinks] = useState(defaultLinks || {});
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    setItems((current) => {
      const known = new Set(current.map((i) => `${i.file.name}:${i.file.size}`));
      const fresh = incoming.filter((f) => !known.has(`${f.name}:${f.size}`)).map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file, status: 'ready', error: null }));
      return [...current, ...fresh].slice(0, MAX_FILES);
    });
  };

  const reset = () => {
    setItems([]); setForm(initialForm); setLinks(defaultLinks || {}); setRunning(false);
    if (inputRef.current) inputRef.current.value = '';
  };
  const close = (next) => { if (!next && running) return; if (!next) reset(); onOpenChange?.(next); };

  const pending = items.filter((i) => i.status !== 'done');
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const linked = useMemo(() => Object.entries(links).filter(([, v]) => v?.id), [links]);

  const buildForm = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    if (items.length === 1 && form.title.trim()) fd.append('title', form.title.trim());
    fd.append('documentType', form.documentType);
    fd.append('category', form.category);
    if (form.folderPath.trim()) fd.append('folderPath', form.folderPath.trim());
    if (form.description.trim()) fd.append('description', form.description.trim());
    for (const [type, value] of linked) fd.append(ID_FIELD[type], value.id);
    if (linked.length) {
      fd.append('sourceRecordType', linked[0][0]);
      fd.append('sourceRecordId', linked[0][1].id);
    }
    return fd;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!pending.length || running) return;
    setRunning(true);
    const queue = [...pending];
    const update = (key, patch) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    let ok = 0;
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        update(item.key, { status: 'uploading', error: null });
        try {
          await documentRepositoryService.upload(buildForm(item.file));
          update(item.key, { status: 'done' });
          ok += 1;
        } catch (err) {
          update(item.key, { status: 'error', error: err?.message || String(err) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    await queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() });
    setRunning(false);
    if (ok) showSuccess(t('documents.hub.upload.done', '{count} document(s) uploaded', { count: ok }));
    if (ok === pending.length) { reset(); onOpenChange?.(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-3xl">
        <div className="relative overflow-hidden border-b border-white/10 bg-[#060c18] px-6 pb-5 pt-6 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_-20%,rgba(56,189,248,0.35),transparent_55%),radial-gradient(circle_at_0%_120%,rgba(34,211,238,0.18),transparent_45%)]" />
          <div className="relative flex items-center gap-4 pe-8">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07]"><CloudUpload className="size-6 text-sky-200" aria-hidden="true" /></span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">{t('documents.repository.uploadTitle')}</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-slate-300">{t('documents.hub.upload.desc', 'Drop one or more files — details and links apply to all of them.')}</DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (!running) addFiles(e.dataTransfer.files); }}
              className={cn('rounded-2xl border-2 border-dashed p-5 text-center transition', dragging ? 'border-sky-500 bg-sky-500/10' : 'border-border bg-muted/30')}
            >
              <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} disabled={running} />
              <UploadCloud className="mx-auto size-8 text-sky-500" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">{t('documents.hub.upload.drop', 'Drag files here')}</p>
              <p className="text-xs text-muted-foreground">{t('documents.hub.upload.limit', 'Up to {count} files at once', { count: MAX_FILES })}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => inputRef.current?.click()} disabled={running}>
                {t('documents.repository.selectFileHelp', 'Choose files')}
              </Button>
            </div>

            {items.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                {items.map((item) => {
                  const meta = FILE_KIND_META[fileKindOf({ fileName: item.file.name, mimeType: item.file.type })];
                  const Icon = meta.icon;
                  return (
                    <li key={item.key} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset', meta.tone)}><Icon className="size-4" aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.file.name}</p>
                        <p className={cn('truncate text-xs', item.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                          {item.status === 'error' ? item.error : formatBytes(item.file.size, intl)}
                        </p>
                      </div>
                      {item.status === 'uploading' ? <Loader2 className="size-4 animate-spin text-sky-500" aria-label={t('documents.hub.upload.uploading', 'Uploading')} /> : null}
                      {item.status === 'done' ? <CheckCircle2 className="size-4 text-emerald-500" aria-label={t('documents.hub.upload.uploaded', 'Uploaded')} /> : null}
                      {item.status === 'error' ? <TriangleAlert className="size-4 text-rose-500" aria-hidden="true" /> : null}
                      {!running && item.status !== 'done' ? (
                        <button type="button" onClick={() => setItems((cur) => cur.filter((i) => i.key !== item.key))} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label={t('common.remove', 'Remove')}>
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {items.length <= 1 ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="doc-title">{t('documents.repository.title')}</Label>
                  <Input id="doc-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={items[0]?.file.name || ''} disabled={running} className="h-10 rounded-xl" />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label>{t('documents.repository.documentType')}</Label>
                <Select value={form.documentType} onValueChange={(v) => set('documentType', v)} disabled={running}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOCUMENT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('documents.repository.category')}</Label>
                <Select value={form.category} onValueChange={(v) => set('category', v)} disabled={running}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOCUMENT_CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
              <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold"><Link2 className="size-4 text-sky-500" aria-hidden="true" />{t('documents.hub.upload.links', 'Link to')}</legend>
              <p className="text-xs text-muted-foreground">{t('documents.hub.upload.linksHint', 'Optional — the document then appears on each linked record.')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {LINKABLE_TYPES.map((type) => (
                  <div key={type} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t(`documents.repository.link.${type}`, type)}</Label>
                    <DocumentLinkPicker type={type} value={links[type] || null} onChange={(v) => setLinks((l) => ({ ...l, [type]: v }))} disabled={running} />
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-folder">{t('documents.repository.folder')}</Label>
                <Input id="doc-folder" value={form.folderPath} onChange={(e) => set('folderPath', e.target.value)} placeholder={t('documents.hub.upload.folderPlaceholder', 'Auto from the first link')} disabled={running} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-desc">{t('documents.repository.descriptionField')}</Label>
                <Textarea id="doc-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} disabled={running} className="rounded-xl" />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {running ? t('documents.hub.upload.progress', '{done} of {total} uploaded', { done, total: items.length })
                : failed ? t('documents.hub.upload.failed', '{count} failed — fix or remove them, then retry', { count: failed })
                  : items.length ? t('documents.hub.upload.ready', '{count} file(s) ready', { count: pending.length }) : ''}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => close(false)} disabled={running}>{t('common.cancel')}</Button>
              <Button type="submit" className="gap-2 rounded-full px-5" disabled={running || !pending.length}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                {failed && !running ? t('documents.hub.upload.retry', 'Retry') : t('documents.repository.upload')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
