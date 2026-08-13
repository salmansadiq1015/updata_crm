'use client';

import { useMemo, useState } from 'react';
import { FileText, Loader2, Paperclip, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useAttachableDocuments } from '@/modules/documents/hooks/use-document-repository';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/**
 * Pick documents to attach from the repository. Opens on the record's own
 * documents — the common case — and widens to everything on demand, because
 * scoping to one record is exactly why the previous picker looked empty.
 *
 * `scope` is a repository filter ({ siteId } / { customerId } / ...); pass none
 * to search everything from the start.
 */
export function AttachmentPicker({ open, onOpenChange, scope = {}, onConfirm, alreadyAttached = [] }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [allDocuments, setAllDocuments] = useState(false);
  const [selected, setSelected] = useState({});
  const debouncedSearch = useDebounce(search, 300);

  const hasScope = Object.values(scope).some(Boolean);
  const params = useMemo(() => ({
    ...(allDocuments || !hasScope ? {} : scope),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    limit: 100,
  }), [allDocuments, hasScope, scope, debouncedSearch]);

  const { data: documentsRaw = [], isLoading } = useAttachableDocuments(params, { enabled: open });
  const attachedKeys = useMemo(
    () => new Set(alreadyAttached.map((a) => String(a.fileId || a.id))),
    [alreadyAttached],
  );
  // Only a document backed by a stored file can travel as an attachment.
  const documents = useMemo(
    () => documentsRaw.filter((doc) => doc.fileId && !attachedKeys.has(String(doc.fileId))),
    [documentsRaw, attachedKeys],
  );

  const toggle = (doc) => setSelected((current) => {
    const next = { ...current };
    if (next[doc.id]) delete next[doc.id];
    else next[doc.id] = { fileId: doc.fileId, fileName: doc.fileName || doc.title || doc.id };
    return next;
  });

  const chosen = Object.values(selected);

  const handleOpenChange = (next) => {
    if (!next) { setSelected({}); setSearch(''); setAllDocuments(false); }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-primary" />
            {t('doctpl.email.pickAttachments', 'Dokumente anhängen')}
          </DialogTitle>
          <DialogDescription>
            {t('doctpl.email.pickAttachmentsDesc', 'Wählen Sie Dokumente aus der Dokumentenablage.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('documents.repository.searchPlaceholder', 'Dokumente suchen...')}
                className="pl-8"
              />
            </div>
            {hasScope && (
              <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
                <Checkbox checked={allDocuments} onCheckedChange={(v) => setAllDocuments(!!v)} />
                {t('doctpl.email.allDocuments', 'Alle Dokumente')}
              </label>
            )}
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin rounded-lg border border-border p-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading', 'Wird geladen...')}
              </div>
            ) : documents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('doctpl.email.noDocumentsFound', 'Keine Dokumente gefunden.')}
              </p>
            ) : (
              documents.map((doc) => (
                <label
                  key={doc.id}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    selected[doc.id] ? 'bg-primary/10' : 'hover:bg-muted/60',
                  )}
                >
                  {/* A label, not a button: Checkbox renders its own <button>,
                      and nesting one inside another breaks hydration. */}
                  <Checkbox checked={!!selected[doc.id]} onCheckedChange={() => toggle(doc)} />
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">{doc.title || doc.fileName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[doc.fileName, doc.createdAt ? formatDate(doc.createdAt) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>{t('common.cancel', 'Abbrechen')}</Button>
          <Button
            disabled={!chosen.length}
            onClick={() => { onConfirm(chosen); handleOpenChange(false); }}
          >
            {t('doctpl.email.attachCount', '{count} anhängen', { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
