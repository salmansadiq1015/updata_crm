'use client';

import { useMemo, useState } from 'react';
import { Mail, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDocumentRepository } from '@/modules/documents/hooks/use-document-repository';
import { EmailComposeModal } from '@/modules/doctpl/components/EmailComposeModal';

/**
 * Send an email straight from an object (site): pick one or more of the
 * object's already-uploaded documents (no download needed) and attach them.
 * The compose modal handles recipients/subject/body and dispatch.
 */
export function SiteEmailButton({ siteId, defaultTo }) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState({});

  const { data, isLoading } = useDocumentRepository({ siteId, sortOrder: 'desc', limit: 100 });
  // Only documents backed by a stored file can be attached.
  const documents = useMemo(() => (data?.items || []).filter((d) => d.fileId), [data]);

  const toggle = (doc) => setSelected((current) => {
    const next = { ...current };
    if (next[doc.id]) delete next[doc.id];
    else next[doc.id] = { fileId: doc.fileId, fileName: doc.fileName || doc.title };
    return next;
  });

  const attachments = useMemo(() => Object.values(selected), [selected]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => { setSelected({}); setPickerOpen(true); }}
      >
        <Mail className="h-3.5 w-3.5" /> {t('crm.sites.sendEmail', 'E-Mail senden')}
      </Button>

      {/* Step 1 — pick documents to attach */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('crm.sites.selectDocuments', 'Dokumente als Anhang auswählen')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-1.5 overflow-y-auto py-1">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Laden...')}</p>
            ) : documents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('crm.sites.noAttachableDocs', 'Keine Dokumente zum Anhängen vorhanden.')}
              </p>
            ) : (
              documents.map((doc) => (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <Checkbox checked={!!selected[doc.id]} onCheckedChange={() => toggle(doc)} />
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{doc.fileName || doc.title}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>{t('common.cancel', 'Abbrechen')}</Button>
            <Button
              className="gap-1.5"
              disabled={attachments.length === 0}
              onClick={() => { setPickerOpen(false); setComposeOpen(true); }}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {t('crm.sites.attachAndCompose', 'Weiter ({count})', { count: attachments.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2 — compose & send (attachments carried by fileId) */}
      <EmailComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialValues={{
          to: defaultTo || '',
          attachments,
          sourceModule: 'crm',
          sourceRecordId: siteId,
        }}
      />
    </>
  );
}
