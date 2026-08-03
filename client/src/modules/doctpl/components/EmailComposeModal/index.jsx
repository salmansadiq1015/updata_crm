'use client';

import { useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { useSendEmail } from '../../hooks/useEmailMutations';

const DEFAULT_FORM = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '',
  senderName: '',
  senderAddress: '',
  documentId: null,
  documentIds: [],
  attachments: [],
  sourceModule: null,
  sourceRecordId: null,
};

function buildInitialAttachments(initialValues = {}) {
  if (Array.isArray(initialValues.attachments) && initialValues.attachments.length) {
    return initialValues.attachments
      .filter((a) => a && (a.id || a._id || a.fileId))
      // Attachments can reference a generated document (id) or a stored file
      // directly (fileId — e.g. an uploaded object/project document).
      .map((a) => ({
        id: a.id || a._id || null,
        fileId: a.fileId || null,
        fileName: a.fileName || a.name || String(a.id || a._id || a.fileId),
      }));
  }
  if (initialValues.documentId) {
    return [{ id: initialValues.documentId, fileId: null, fileName: initialValues.documentFileName || initialValues.documentId }];
  }
  return [];
}

const attachmentKeyOf = (a) => a.id || a.fileId;

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value || '';
}

function toRecipientList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInitialForm(initialValues = {}) {
  return {
    ...DEFAULT_FORM,
    ...initialValues,
    to: normalizeRecipients(initialValues.to),
    cc: normalizeRecipients(initialValues.cc),
    bcc: normalizeRecipients(initialValues.bcc),
    attachments: buildInitialAttachments(initialValues),
  };
}

function EmailComposeForm({ initialValues, onClose }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => buildInitialForm(initialValues));
  const send = useSendEmail();

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const removeAttachment = (key) => setForm((current) => ({
    ...current,
    attachments: current.attachments.filter((a) => attachmentKeyOf(a) !== key),
  }));

  const handleSend = async () => {
    // Generated documents are sent by id; uploaded object/project documents by
    // their stored fileId.
    const documentIds = form.attachments.filter((a) => a.id && !a.fileId).map((a) => a.id);
    const fileAttachments = form.attachments
      .filter((a) => a.fileId)
      .map((a) => ({ fileId: a.fileId, fileName: a.fileName }));
    const payload = {
      to: toRecipientList(form.to),
      cc: toRecipientList(form.cc),
      bcc: toRecipientList(form.bcc),
      subject: form.subject,
      bodyHtml: form.bodyHtml,
      sourceModule: form.sourceModule,
      sourceRecordId: form.sourceRecordId,
      documentId: documentIds[0] || null,
      documentIds,
      fileAttachments,
    };
    // senderName/senderAddress are optional; the server resolves them from the CI
    // config when omitted. Sending empty strings fails Joi (string().email() rejects '').
    if (form.senderName?.trim()) payload.senderName = form.senderName.trim();
    if (form.senderAddress?.trim()) payload.senderAddress = form.senderAddress.trim();
    try {
      await send.mutateAsync(payload);
      onClose();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{t('doctpl.sendByEmail')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-1">
        <div>
          <Label>{t('doctpl.to')}</Label>
          <Input value={form.to} onChange={set('to')} placeholder={t('doctpl.email.recipientPlaceholder')} />
        </div>
        <div>
          <Label>{t('doctpl.cc')}</Label>
          <Input value={form.cc} onChange={set('cc')} placeholder={t('common.optional')} />
        </div>
        <div>
          <Label>{t('doctpl.bcc')}</Label>
          <Input value={form.bcc} onChange={set('bcc')} placeholder={t('common.optional')} className="text-sm" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('doctpl.senderName')}</Label>
            <Input value={form.senderName} onChange={set('senderName')} placeholder={t('common.optional')} />
          </div>
          <div>
            <Label>{t('doctpl.senderAddress')}</Label>
            <Input value={form.senderAddress} onChange={set('senderAddress')} placeholder={t('common.optional')} />
          </div>
        </div>
        <div>
          <Label>{t('doctpl.subject')}</Label>
          <Input value={form.subject} onChange={set('subject')} />
        </div>
        <div>
          <Label>{t('doctpl.message')}</Label>
          <Textarea rows={7} value={form.bodyHtml} onChange={set('bodyHtml')} />
        </div>
        <div>
          <Label className="flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />{t('doctpl.attachments')}
          </Label>
          {form.attachments.length ? (
            <ul className="mt-1.5 space-y-1.5">
              {form.attachments.map((attachment) => (
                <li
                  key={attachmentKeyOf(attachment)}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{attachment.fileName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachmentKeyOf(attachment))}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t('doctpl.email.removeAttachment')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t('doctpl.email.noAttachments')}</p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSend} disabled={send.isPending || !toRecipientList(form.to).length || !form.attachments.length}>
          {send.isPending ? t('doctpl.sending') : t('common.send')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function EmailComposeModal({ open, onClose, initialValues = {} }) {
  const attachmentKey = Array.isArray(initialValues.attachments)
    ? initialValues.attachments.map((a) => a?.id || a?._id || a?.fileId).join('-')
    : '';
  const formKey = `${initialValues.documentId || ''}:${attachmentKey}:${initialValues.subject || ''}:${initialValues.to || ''}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {open && <EmailComposeForm key={formKey} initialValues={initialValues} onClose={onClose} />}
    </Dialog>
  );
}
