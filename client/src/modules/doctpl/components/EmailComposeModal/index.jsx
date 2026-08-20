'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { useSendEmail } from '../../hooks/useEmailMutations';
import { emailService } from '../../services/EmailService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AttachmentPicker } from './attachment-picker';

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

function EmailComposeForm({ initialValues, onClose, onSent }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState(() => buildInitialForm(initialValues));
  const [pickerOpen, setPickerOpen] = useState(false);
  // Reusable email texts: pick one and its placeholders resolve against the
  // record the message is being sent from.
  const { data: templates = [] } = useQuery({
    queryKey: ['doctpl', 'email-templates'],
    queryFn: async () => (await emailService.listTemplates())?.data ?? [],
    staleTime: 5 * 60_000,
  });
  const usable = templates.filter((tpl) => tpl.isActive !== false && tpl.language === language);

  const applyTemplate = async (templateId) => {
    const scope = initialValues.attachmentScope || {};
    const res = await emailService.renderTemplate(templateId, {
      customerId: scope.customerId,
      siteId: scope.siteId,
      projectId: scope.projectId,
    });
    const rendered = res?.data;
    if (!rendered) return;
    setForm((current) => ({
      ...current,
      subject: rendered.subject || current.subject,
      bodyHtml: rendered.bodyHtml || current.bodyHtml,
    }));
  };
  const send = useSendEmail();

  const addAttachments = (picked) => setForm((current) => {
    const known = new Set(current.attachments.map(attachmentKeyOf).map(String));
    return {
      ...current,
      attachments: [...current.attachments, ...picked.filter((a) => !known.has(String(a.fileId)))],
    };
  });

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
    };
    // An email without attachments simply omits them: the schema validates
    // documentId as an ObjectId, so sending null to mean "none" is rejected.
    if (documentIds.length) {
      payload.documentId = documentIds[0];
      payload.documentIds = documentIds;
    }
    if (fileAttachments.length) payload.fileAttachments = fileAttachments;
    // senderName/senderAddress are optional; the server resolves them from the CI
    // config when omitted. Sending empty strings fails Joi (string().email() rejects '').
    if (form.senderName?.trim()) payload.senderName = form.senderName.trim();
    if (form.senderAddress?.trim()) payload.senderAddress = form.senderAddress.trim();
    try {
      const record = await send.mutateAsync(payload);
      showSuccess(t('doctpl.email.sent', 'E-Mail gesendet'));
      onClose();
      // emailService.send resolves the response envelope, not the record —
      // unwrap it so the caller gets the id it needs to open the entry.
      onSent?.(record?.data ?? record);
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
          <Label>{t('doctpl.to')}<span className="ml-1 text-red-400">*</span></Label>
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
        {usable.length > 0 && (
          <div>
            <Label>{t('doctpl.email.template', 'Textvorlage')}</Label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder={t('doctpl.email.templatePlaceholder', 'Vorlage übernehmen (optional)')} /></SelectTrigger>
              <SelectContent>
                {usable.map((tpl) => (
                  <SelectItem key={tpl._id} value={tpl._id}>{tpl.templateType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>{t('doctpl.subject')}<span className="ml-1 text-red-400">*</span></Label>
          <Input value={form.subject} onChange={set('subject')} />
        </div>
        <div>
          <Label>{t('doctpl.message')}</Label>
          <Textarea rows={7} value={form.bodyHtml} onChange={set('bodyHtml')} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />{t('doctpl.attachments')}
            </Label>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3 w-3" /> {t('doctpl.email.addAttachment', 'Dokument anhängen')}
            </Button>
          </div>
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
        <Button
          onClick={handleSend}
          disabled={send.isPending || !toRecipientList(form.to).length || !form.subject.trim()}
        >
          {send.isPending ? t('doctpl.sending') : t('common.send')}
        </Button>
      </DialogFooter>

      <AttachmentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        scope={initialValues.attachmentScope || {}}
        alreadyAttached={form.attachments}
        onConfirm={addAttachments}
      />
    </DialogContent>
  );
}

export function EmailComposeModal({ open, onClose, initialValues = {}, onSent }) {
  const attachmentKey = Array.isArray(initialValues.attachments)
    ? initialValues.attachments.map((a) => a?.id || a?._id || a?.fileId).join('-')
    : '';
  const formKey = `${initialValues.documentId || ''}:${attachmentKey}:${initialValues.subject || ''}:${initialValues.to || ''}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {open && <EmailComposeForm key={formKey} initialValues={initialValues} onClose={onClose} onSent={onSent} />}
    </Dialog>
  );
}
